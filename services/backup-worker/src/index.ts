import { fileURLToPath } from 'node:url';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from '@vaultstack/config';
import { createLogger } from '@vaultstack/logger';

export const BACKUP_QUEUE_NAME = 'backup-jobs';

export function createBackupWorker(redisUrl: string, logger: ReturnType<typeof createLogger>) {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

  return new Worker(
    BACKUP_QUEUE_NAME,
    (job) => {
      logger.info({ jobId: job.id, name: job.name }, 'Backup worker received job (placeholder)');
      return Promise.resolve({ status: 'not_implemented' });
    },
    { connection },
  );
}

function main(): void {
  const config = loadEnv();
  const logger = createLogger({ name: 'backup-worker', level: config.LOG_LEVEL });
  const worker = createBackupWorker(config.REDIS_URL, logger);

  worker.on('ready', () => {
    logger.info('Backup worker ready');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Backup job failed');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down backup worker');
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}
