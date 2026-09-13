import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import type { Prisma, PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { listArchive } from './archive-listing.js';
import type { ObjectService } from '../storage/services/object.service.js';

const execFileAsync = promisify(execFile);
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

export const PREVIEW_QUEUE_NAME = 'vaultstack-preview';
export type PreviewKind = 'ARCHIVE' | 'OFFICE';

export interface PreviewJobPayload {
  jobId: string;
}

export type PreviewEnqueuer = (payload: PreviewJobPayload) => Promise<void>;

export class PreviewService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly objects: ObjectService,
    private readonly enqueue: PreviewEnqueuer,
    private readonly logger: Logger,
  ) {}

  async create(organizationId: string, objectId: string, kind: PreviewKind) {
    const object = await this.objects.get(organizationId, objectId);
    const job = await this.prisma.previewJob.create({
      data: { organizationId, objectId: object.id, kind, status: 'QUEUED' },
    });
    await this.enqueue({ jobId: job.id });
    return job;
  }

  async get(organizationId: string, jobId: string) {
    return this.prisma.previewJob.findFirst({
      where: { id: jobId, organizationId },
    });
  }

  async process(jobId: string): Promise<void> {
    const job = await this.prisma.previewJob.findUnique({
      where: { id: jobId },
      include: { object: true },
    });
    if (!job) {
      return;
    }
    await this.prisma.previewJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), error: null },
    });
    try {
      const { stream } = await this.objects.openDownload(job.organizationId, job.objectId);
      const bytes = await readLimited(stream.body, MAX_SOURCE_BYTES);
      const fileName = job.object.key.split('/').pop() ?? job.object.key;
      if (job.kind === 'ARCHIVE') {
        const entries = listArchive(bytes, fileName);
        await this.prisma.previewJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            result: { type: 'archive', entries } as unknown as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return;
      }

      const output = await convertOfficeToPdf(bytes, fileName);
      const previewObject = await this.objects.put({
        organizationId: job.organizationId,
        bucketId: job.object.bucketId,
        key: `_previews/${job.objectId}/${jobId}.pdf`,
        body: Readable.from(output),
        contentType: 'application/pdf',
        expectedSize: output.byteLength,
        metadata: { sourceObjectId: job.objectId, previewKind: 'OFFICE' },
        userId: null,
      });
      await this.prisma.previewJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          outputObjectId: previewObject.id,
          result: { type: 'document', contentType: 'application/pdf' },
          converter: 'libreoffice',
          completedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview failed';
      this.logger.warn({ jobId, message }, 'Preview job failed');
      await this.prisma.previewJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message, completedAt: new Date() },
      });
    }
  }
}

async function readLimited(stream: Readable, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = chunk instanceof Uint8Array ? chunk : new Uint8Array(Buffer.from(chunk));
    size += buffer.byteLength;
    if (size > limit) {
      throw new Error(`Preview source exceeds ${limit} byte limit`);
    }
    chunks.push(buffer);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function convertOfficeToPdf(bytes: Uint8Array, fileName: string): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), 'vaultstack-preview-'));
  const input = join(directory, safeFileName(fileName));
  try {
    await writeFile(input, bytes);
    await execFileAsync(
      'soffice',
      ['--headless', '--convert-to', 'pdf', '--outdir', directory, input],
      { timeout: 60_000, maxBuffer: 1_000_000 },
    );
    const output = join(
      directory,
      `${input.slice(input.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')}.pdf`,
    );
    return await readFile(output);
  } catch {
    throw new Error('LibreOffice is unavailable in the preview worker image');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'document.bin';
}
