import { Queue, Worker, type ConnectionOptions, type QueueInstance } from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import {
  PREVIEW_QUEUE_NAME,
  type PreviewJobPayload,
  type PreviewService,
} from '../modules/previews/preview.service.js';

export function createPreviewQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(PREVIEW_QUEUE_NAME, { connection });
}

export async function enqueuePreviewPayload(
  queue: QueueInstance,
  payload: PreviewJobPayload,
): Promise<void> {
  await queue.add('preview', payload, {
    removeOnComplete: 50,
    removeOnFail: 100,
    attempts: 2,
    backoff: { type: 'exponential', delay: 1_000 },
  });
}

export function createPreviewWorker(deps: {
  connection: ConnectionOptions;
  previews: PreviewService;
  logger: Logger;
}) {
  return new Worker(
    PREVIEW_QUEUE_NAME,
    async (job) => {
      await deps.previews.process((job.data as PreviewJobPayload).jobId);
      deps.logger.info({ jobId: job.id }, 'Preview job processed');
    },
    { connection: deps.connection, concurrency: 1 },
  );
}
