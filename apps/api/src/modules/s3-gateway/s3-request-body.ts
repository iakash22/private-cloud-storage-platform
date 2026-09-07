import type { Request } from 'express';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const DEFAULT_LIMIT = 1024 * 1024;

export async function readLimitedBody(req: Request, limit = DEFAULT_LIMIT): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > limit) {
      throw new Error('Request body too large');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

export function parseCompleteMultipartXml(body: Buffer): { partNumber: number; etag: string }[] {
  const xml = body.toString('utf8');
  const parts: { partNumber: number; etag: string }[] = [];
  const partBlocks = xml.match(/<Part>[\s\S]*?<\/Part>/g) ?? [];

  for (const block of partBlocks) {
    const partNumberMatch = /<PartNumber>(\d+)<\/PartNumber>/.exec(block);
    const etagMatch = /<ETag>([\s\S]*?)<\/ETag>/.exec(block);
    const partNumber = Number(partNumberMatch?.[1]);
    const etag = etagMatch?.[1]?.replace(/"/g, '').trim();
    if (!Number.isFinite(partNumber) || !etag) {
      continue;
    }
    parts.push({ partNumber, etag });
  }

  return parts;
}

export function parseCopySource(header: string | undefined): { bucket: string; key: string } {
  const raw = decodeURIComponent((header ?? '').replace(/^\/+/, ''));
  const slash = raw.indexOf('/');
  if (slash <= 0) {
    throw new Error('Invalid copy source');
  }

  return {
    bucket: raw.slice(0, slash),
    key: raw.slice(slash + 1),
  };
}

export async function pipeRequestBody(req: Request, res: { write: (chunk: unknown) => void; end: () => void }): Promise<void> {
  await pipeline(Readable.fromWeb(req as unknown as ReadableStream), res as unknown as NodeJS.WritableStream);
}
