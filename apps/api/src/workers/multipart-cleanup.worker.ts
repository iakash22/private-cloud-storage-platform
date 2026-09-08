import { Queue, Worker, type ConnectionOptions, type QueueInstance } from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import type { UploadService } from '../modules/storage/services/upload.service.js';

export const MULTIPART_CLEANUP_QUEUE = 'storage-multipart-cleanup';
export const MULTIPART_CLEANUP_JOB = 'cleanup-expired-sessions';
export const MULTIPART_CLEANUP_INTERVAL_MS = 60_000;

export interface MultipartCleanupResult {
  uploads: number;
  multipart: number;
}

export async function runMultipartCleanup(uploads: UploadService): Promise<MultipartCleanupResult> {
  return uploads.cleanupExpired();
}

export function createMultipartCleanupQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(MULTIPART_CLEANUP_QUEUE, { connection });
}

export async function scheduleMultipartCleanup(queue: QueueInstance): Promise<void> {
  await queue.add(
    MULTIPART_CLEANUP_JOB,
    {},
    {
      repeat: { every: MULTIPART_CLEANUP_INTERVAL_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
}

export function createMultipartCleanupWorker(deps: {
  connection: ConnectionOptions;
  uploads: UploadService;
  logger: Logger;
}) {
  const { connection, uploads, logger } = deps;

  return new Worker(
    MULTIPART_CLEANUP_QUEUE,
    async () => {
      const result = await runMultipartCleanup(uploads);
      logger.info(
        {
          event: 'storage.multipart.cleanup.job',
          uploads: result.uploads,
          multipart: result.multipart,
        },
        'Multipart cleanup job finished',
      );
      return result;
    },
    { connection, concurrency: 1 },
  );
}
