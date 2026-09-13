import {
  Queue,
  Worker,
  type ConnectionOptions,
  type Job,
  type QueueInstance,
} from '../lib/bullmq.js';
import type { OutboundEmail } from '@vaultstack/email';
import type { Logger } from '@vaultstack/logger';
import type { NotificationService } from '../modules/notifications/notification.service.js';

export const EMAIL_QUEUE_NAME = 'email-delivery';
export const EMAIL_SEND_JOB = 'email.send';

export function createEmailQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(EMAIL_QUEUE_NAME, { connection });
}

export async function enqueueEmail(queue: QueueInstance, message: OutboundEmail): Promise<void> {
  await queue.add(EMAIL_SEND_JOB, message, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
}

export function createEmailWorker(deps: {
  connection: ConnectionOptions;
  notifications: NotificationService;
  logger: Logger;
}) {
  const { connection, notifications, logger } = deps;

  return new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job<OutboundEmail>) => {
      if (job.name !== EMAIL_SEND_JOB) {
        return;
      }
      await notifications.sendNow(job.data);
      logger.debug({ event: 'email.worker.sent', templateId: job.data.templateId }, 'Email job sent');
    },
    { connection, concurrency: 2 },
  );
}
