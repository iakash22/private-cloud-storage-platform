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

// BullMQ requires maxRetriesPerRequest to be null on the shared connection.
const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

const queue = createMultipartCleanupQueue(connection);
const worker = createMultipartCleanupWorker({
  connection,
  uploads: container.storage.uploads,
  logger,
});
const lifecycleQueue = createLifecycleQueue(connection);
const lifecycleWorker = createLifecycleWorker({
  connection,
  policies: container.storage.policies,
  logger,
});

const artifactQueue = createArtifactRetentionQueue(connection);
const artifactWorker = createArtifactRetentionWorker({
  connection,
  artifacts: container.artifacts,
  logger,
});

const backupQueue = createBackupQueue(connection);
const backupWorker = createBackupWorker({
  connection,
  backups: container.backups,
  logger,
  concurrency: config.BACKUP_MAX_CONCURRENT_JOBS,
});

await connection.connect();
await scheduleMultipartCleanup(queue);
await scheduleLifecycle(lifecycleQueue);
await scheduleArtifactRetention(artifactQueue);
await scheduleBackupMaintenance(backupQueue);

logger.info(
  { queues: [queue.name, lifecycleQueue.name, artifactQueue.name, backupQueue.name] },
  'VaultStack storage workers listening',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down storage workers');
  await worker.close();
  await queue.close();
  await lifecycleWorker.close();
  await lifecycleQueue.close();
  await artifactWorker.close();
  await artifactQueue.close();
  await backupWorker.close();
  await backupQueue.close();
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
