import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { FolderOperationName, PublicFolderOperationJob } from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, validationError } from '../../../lib/errors.js';
import { assertValidKeyPrefix } from '../domain/object-key.js';
import type { RequestMeta } from './bucket.service.js';
import type { ObjectService } from './object.service.js';
import type { StorageService } from './storage.service.js';

const PAGE_SIZE = 100;

export interface CreateFolderOperationInput {
  organizationId: string;
  bucketId: string;
  operation: FolderOperationName;
  sourcePrefix: string;
  destinationPrefix?: string;
  userId: string;
  meta: RequestMeta;
}

export interface FolderOperationQueue {
  enqueue(jobId: string): Promise<void>;
}

export interface FolderOperationService {
  create(input: CreateFolderOperationInput): Promise<PublicFolderOperationJob>;
  get(organizationId: string, jobId: string): Promise<PublicFolderOperationJob | null>;
  cancel(organizationId: string, jobId: string, userId: string, meta: RequestMeta): Promise<void>;
  retry(organizationId: string, jobId: string): Promise<PublicFolderOperationJob>;
  process(jobId: string): Promise<void>;
}

export function createFolderOperationService(deps: {
  prisma: PrismaClient;
  objects: ObjectService;
  storage: StorageService;
  queue: FolderOperationQueue;
  logger: Logger;
}): FolderOperationService {
  const { prisma, objects, storage, queue, logger } = deps;

  return {
    async create(input) {
      await storage.resolveBucket(input.organizationId, input.bucketId);
      const sourcePrefix = normalizeOperationPrefix(
        input.sourcePrefix,
        storage.limits.maxKeyLength,
      );
      const destinationPrefix =
        input.destinationPrefix === undefined
          ? undefined
          : normalizeOperationPrefix(input.destinationPrefix, storage.limits.maxKeyLength);

      if (input.operation !== 'DELETE' && !destinationPrefix) {
        throw validationError('A destination prefix is required for this operation');
      }
      if (
        destinationPrefix &&
        (destinationPrefix === sourcePrefix || destinationPrefix.startsWith(sourcePrefix))
      ) {
        throw conflict('The destination cannot be the source folder or one of its children');
      }

      const totalObjects = await prisma.storageObject.count({
        where: {
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          isDeleted: false,
          key: { startsWith: sourcePrefix },
        },
      });
      const job = await prisma.folderOperationJob.create({
        data: {
          organizationId: input.organizationId,
          bucketId: input.bucketId,
          operation: input.operation,
          sourcePrefix,
          destinationPrefix: destinationPrefix ?? null,
          totalObjects,
          createdByUserId: input.userId,
        },
      });
      await queue.enqueue(job.id);
      return serializeJob(job);
    },

    async get(organizationId, jobId) {
      const job = await prisma.folderOperationJob.findFirst({
        where: { id: jobId, organizationId },
      });
      return job ? serializeJob(job) : null;
    },

    async cancel(organizationId, jobId, userId, meta) {
      const job = await prisma.folderOperationJob.findFirst({
        where: { id: jobId, organizationId },
      });
      if (!job) {
        throw validationError('Folder operation not found');
      }
      if (!['QUEUED', 'RUNNING', 'PAUSED'].includes(job.status)) {
        return;
      }
      await prisma.folderOperationJob.update({
        where: { id: job.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await writeAuditLog(prisma, {
        ...meta,
        organizationId,
        userId,
        action: 'storage.folder_operation.cancelled',
        resourceType: 'folder_operation',
        resourceId: job.id,
        metadata: { operation: job.operation, sourcePrefix: job.sourcePrefix },
      });
    },

    async retry(organizationId, jobId) {
      const job = await prisma.folderOperationJob.findFirst({
        where: { id: jobId, organizationId },
      });
      if (!job) {
        throw validationError('Folder operation not found');
      }
      if (!['FAILED', 'PAUSED'].includes(job.status)) {
        return serializeJob(job);
      }
      const retried = await prisma.folderOperationJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', error: null, completedAt: null },
      });
      await queue.enqueue(job.id);
      return serializeJob(retried);
    },

    async process(jobId) {
      const current = await prisma.folderOperationJob.findUnique({ where: { id: jobId } });
      if (!current || current.status === 'CANCELLED' || current.status === 'COMPLETED') {
        return;
      }
      await prisma.folderOperationJob.update({
        where: { id: jobId },
        data: {
          status: 'RUNNING',
          startedAt: current.startedAt ?? new Date(),
          error: null,
        },
      });

      try {
        let cursor = current.nextCursor ?? undefined;
        for (;;) {
          const latest = await prisma.folderOperationJob.findUnique({ where: { id: jobId } });
          if (!latest || latest.status === 'CANCELLED') {
            return;
          }
          const rows = await prisma.storageObject.findMany({
            where: {
              organizationId: latest.organizationId,
              bucketId: latest.bucketId,
              isDeleted: false,
              key: {
                startsWith: latest.sourcePrefix,
                ...(cursor ? { gt: cursor } : {}),
              },
            },
            orderBy: { key: 'asc' },
            take: PAGE_SIZE,
          });
          if (rows.length === 0) {
            await prisma.folderOperationJob.update({
              where: { id: jobId },
              data: { status: 'COMPLETED', completedAt: new Date(), nextCursor: null },
            });
            await writeAuditLog(prisma, {
              organizationId: latest.organizationId,
              userId: latest.createdByUserId,
              action: 'storage.folder_operation.completed',
              resourceType: 'folder_operation',
              resourceId: jobId,
              metadata: {
                operation: latest.operation,
                sourcePrefix: latest.sourcePrefix,
                destinationPrefix: latest.destinationPrefix,
              },
            });
            return;
          }

          for (const row of rows) {
            const relativeKey = row.key.slice(latest.sourcePrefix.length);
            const destinationKey = latest.destinationPrefix
              ? `${latest.destinationPrefix}${relativeKey}`
              : undefined;
            const objectInput = {
              organizationId: latest.organizationId,
              objectId: row.id,
              destinationBucketId: latest.bucketId,
              destinationKey: destinationKey ?? row.key,
              userId: latest.createdByUserId ?? 'system',
              meta: { userAgent: 'folder-operation-worker' },
              allowFolderMarker: row.key.endsWith('/'),
            };

            if (latest.operation === 'DELETE') {
              await objects.remove(
                latest.organizationId,
                row.id,
                latest.createdByUserId ?? 'system',
                { userAgent: 'folder-operation-worker' },
              );
            } else if (latest.operation === 'COPY') {
              const existingDestination = destinationKey
                ? await prisma.storageObject.findFirst({
                    where: {
                      organizationId: latest.organizationId,
                      bucketId: latest.bucketId,
                      key: destinationKey,
                      isDeleted: false,
                    },
                  })
                : null;
              if (existingDestination) {
                cursor = row.key;
                await prisma.folderOperationJob.update({
                  where: { id: jobId },
                  data: { processedObjects: { increment: 1 }, nextCursor: cursor },
                });
                continue;
              }
              await objects.copy(objectInput);
            } else {
              await objects.move(objectInput);
            }

            cursor = row.key;
            await prisma.folderOperationJob.update({
              where: { id: jobId },
              data: {
                processedObjects: { increment: 1 },
                nextCursor: cursor,
              },
            });
          }

          if (rows.length < PAGE_SIZE) {
            await prisma.folderOperationJob.update({
              where: { id: jobId },
              data: { status: 'COMPLETED', completedAt: new Date(), nextCursor: null },
            });
            return;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Folder operation failed';
        logger.error({ error, jobId }, 'Folder operation failed');
        await prisma.folderOperationJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            error: message,
            failedObjects: { increment: 1 },
            completedAt: new Date(),
          },
        });
        throw new Error(message);
      }
    },
  };
}

function normalizeOperationPrefix(prefix: string, maxLength: number): string {
  const normalized = assertValidKeyPrefix(prefix, maxLength);
  if (!normalized) {
    throw validationError('Folder operations require a non-empty source or destination prefix');
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function serializeJob(job: {
  id: string;
  organizationId: string;
  bucketId: string;
  operation: string;
  sourcePrefix: string;
  destinationPrefix: string | null;
  status: string;
  processedObjects: number;
  totalObjects: number | null;
  failedObjects: number;
  nextCursor: string | null;
  error: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}): PublicFolderOperationJob {
  return {
    ...job,
    operation: job.operation as PublicFolderOperationJob['operation'],
    status: job.status as PublicFolderOperationJob['status'],
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
  };
}
