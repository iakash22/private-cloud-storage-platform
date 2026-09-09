import { Redis } from 'ioredis';
import { loadEnv } from '@vaultstack/config';
import { createPrismaClient } from '@vaultstack/database';
import { createLogger } from '@vaultstack/logger';
import { createAppContainer } from '../container/app-container.js';
import {
  createMultipartCleanupQueue,
  createMultipartCleanupWorker,
  scheduleMultipartCleanup,
} from './multipart-cleanup.worker.js';
import {
  createLifecycleQueue,
  createLifecycleWorker,
  scheduleLifecycle,
} from './lifecycle.worker.js';
import {
  createArtifactRetentionQueue,
  createArtifactRetentionWorker,
  scheduleArtifactRetention,
} from './artifact-retention.worker.js';
import {
  createBackupQueue,
  createBackupWorker,
  scheduleBackupMaintenance,
} from './backup.worker.js';

const config = loadEnv();
const logger = createLogger({ name: 'api-worker', level: config.LOG_LEVEL });
const prisma = createPrismaClient(config.DATABASE_URL);
const container = createAppContainer(prisma, config, logger);
const runStorageWorkers = config.WORKER_ROLE !== 'backup';
const runBackupWorkers = config.WORKER_ROLE === 'all' || config.WORKER_ROLE === 'backup';

// BullMQ requires maxRetriesPerRequest to be null on the shared connection.
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

const closeWorkers: (() => Promise<void>)[] = [];
const closeQueues: (() => Promise<void>)[] = [];
const queueNames: string[] = [];
const schedules: (() => Promise<void>)[] = [];

if (runStorageWorkers) {
  const queue = createMultipartCleanupQueue(connection);
  const worker = createMultipartCleanupWorker({
    connection,
    uploads: container.storage.uploads,
    logger,
  });
  closeWorkers.push(() => worker.close());
  closeQueues.push(() => queue.close());
  queueNames.push(queue.name);
  schedules.push(() => scheduleMultipartCleanup(queue));

  const lifecycleQueue = createLifecycleQueue(connection);
  const lifecycleWorker = createLifecycleWorker({
    connection,
    policies: container.storage.policies,
    logger,
  });
  closeWorkers.push(() => lifecycleWorker.close());
  closeQueues.push(() => lifecycleQueue.close());
  queueNames.push(lifecycleQueue.name);
  schedules.push(() => scheduleLifecycle(lifecycleQueue));

  const artifactQueue = createArtifactRetentionQueue(connection);
  const artifactWorker = createArtifactRetentionWorker({
    connection,
    artifacts: container.artifacts,
    logger,
  });
  closeWorkers.push(() => artifactWorker.close());
  closeQueues.push(() => artifactQueue.close());
  queueNames.push(artifactQueue.name);
  schedules.push(() => scheduleArtifactRetention(artifactQueue));
}

if (runBackupWorkers) {
  const backupQueue = createBackupQueue(connection);
  const backupWorker = createBackupWorker({
    connection,
    backups: container.backups,
    logger,
    concurrency: config.BACKUP_MAX_CONCURRENT_JOBS,
  });
  closeWorkers.push(() => backupWorker.close());
  closeQueues.push(() => backupQueue.close());
  queueNames.push(backupQueue.name);
  schedules.push(() => scheduleBackupMaintenance(backupQueue));
}

await connection.connect();
await Promise.all(schedules.map((schedule) => schedule()));

logger.info(
  { role: config.WORKER_ROLE, queues: queueNames },
  'VaultStack storage workers listening',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down storage workers');
  await Promise.all(closeWorkers.map((close) => close()));
  await Promise.all(closeQueues.map((close) => close()));
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
