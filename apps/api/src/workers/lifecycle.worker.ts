import { Queue, Worker, type ConnectionOptions, type QueueInstance } from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import type { PolicyService } from '../modules/storage/services/policy.service.js';

export const LIFECYCLE_QUEUE = 'storage-lifecycle';
export const LIFECYCLE_JOB = 'apply-lifecycle-policies';
export const LIFECYCLE_INTERVAL_MS = 60_000;

export function createLifecycleQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(LIFECYCLE_QUEUE, { connection });
}

export async function scheduleLifecycle(queue: QueueInstance): Promise<void> {
  await queue.add(
    LIFECYCLE_JOB,
    {},
    {
      repeat: { every: LIFECYCLE_INTERVAL_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
}

export function createLifecycleWorker(deps: {
  connection: ConnectionOptions;
  policies: PolicyService;
  logger: Logger;
}) {
  const { connection, policies, logger } = deps;

  return new Worker(
    LIFECYCLE_QUEUE,
    async () => {
      const result = await policies.applyDuePolicies();
      logger.info({ event: 'storage.lifecycle.job', ...result }, 'Lifecycle job finished');
      return result;
    },
    { connection, concurrency: 1 },
  );
}
