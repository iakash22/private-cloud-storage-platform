import { Queue, Worker, type ConnectionOptions, type QueueInstance } from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import type { FolderOperationService } from '../modules/storage/services/folder-operation.service.js';

export const FOLDER_OPERATION_QUEUE = 'vaultstack-folder-operations';

export function createFolderOperationQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(FOLDER_OPERATION_QUEUE, { connection });
}

export function createFolderOperationWorker(deps: {
  connection: ConnectionOptions;
  operations: FolderOperationService;
  logger: Logger;
}) {
  return new Worker(
    FOLDER_OPERATION_QUEUE,
    async (job) => {
      const payload = job.data as unknown as { jobId: string };
      await deps.operations.process(payload.jobId);
      deps.logger.info({ jobId: job.id }, 'Folder operation processed');
    },
    { connection: deps.connection, concurrency: 1 },
  );
}

export async function enqueueFolderOperation(queue: QueueInstance, jobId: string): Promise<void> {
  await queue.add(
    'folder-operation',
    { jobId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}
