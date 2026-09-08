import {
  Queue,
  Worker,
  type ConnectionOptions,
  type Job,
  type QueueInstance,
} from '../lib/bullmq.js';
import type { Logger } from '@vaultstack/logger';
import type {
  BackupsService,
  BackupQueuePayload,
} from '../modules/backups/services/backups.service.js';

export const BACKUP_QUEUE_NAME = 'backup-jobs';
export const BACKUP_RUN_JOB = 'backup.run';
export const BACKUP_RESTORE_JOB = 'backup.restore';
export const BACKUP_RETENTION_JOB = 'backup.retention';
export const BACKUP_SCHEDULE_JOB = 'backup.schedules';
export const BACKUP_RETENTION_INTERVAL_MS = 60 * 60 * 1000;
export const BACKUP_SCHEDULE_INTERVAL_MS = 60_000;

export function createBackupQueue(connection: ConnectionOptions): QueueInstance {
  return new Queue(BACKUP_QUEUE_NAME, { connection });
}

export async function scheduleBackupMaintenance(queue: QueueInstance): Promise<void> {
  await queue.add(
    BACKUP_RETENTION_JOB,
    {},
    {
      repeat: { every: BACKUP_RETENTION_INTERVAL_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
  await queue.add(
    BACKUP_SCHEDULE_JOB,
    {},
    {
      repeat: { every: BACKUP_SCHEDULE_INTERVAL_MS },
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );
}

export async function enqueueBackupPayload(
  queue: QueueInstance,
  payload: BackupQueuePayload,
): Promise<void> {
  await queue.add(payload.kind === 'run' ? BACKUP_RUN_JOB : BACKUP_RESTORE_JOB, payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  });
}

export function createBackupWorker(deps: {
  connection: ConnectionOptions;
  backups: BackupsService;
  logger: Logger;
  concurrency?: number;
}) {
  const { connection, backups, logger, concurrency = 1 } = deps;

  return new Worker(
    BACKUP_QUEUE_NAME,
    async (job: Job) => {
      if (job.name === BACKUP_RETENTION_JOB) {
        const result = await backups.applyRetention();
        logger.info({ event: 'backup.retention.job', ...result }, 'Backup retention finished');
        return result;
      }
      if (job.name === BACKUP_SCHEDULE_JOB) {
        const result = await backups.enqueueDueSchedules();
        logger.info({ event: 'backup.schedule.job', ...result }, 'Backup schedules processed');
        return result;
      }
      const payload = job.data as BackupQueuePayload;
      await backups.runPayload(payload);
      logger.info({ event: 'backup.job', name: job.name, payload }, 'Backup job finished');
      return { ok: true };
    },
    { connection, concurrency },
  );
}
