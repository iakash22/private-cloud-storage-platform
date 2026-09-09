import { statfsSync } from 'node:fs';
import {
  BackupJobStatus,
  MultipartUploadStatus,
  type PrismaClient,
  UploadStatus,
} from '@vaultstack/database';
import type { EnvConfig } from '@vaultstack/config';
import type { Redis } from 'ioredis';
import type { MetricsRegistry } from './metrics.js';
import type { StorageMetrics } from '../modules/storage/services/storage.metrics.js';

const WORKER_QUEUES = [
  'backup-jobs',
  'artifact-retention',
  'multipart-cleanup',
  'lifecycle',
] as const;

const WORKER_STATES = ['wait', 'active', 'failed', 'delayed'] as const;

export async function collectRuntimeMetrics(input: {
  registry: MetricsRegistry;
  prisma: PrismaClient;
  redis: Redis;
  config: EnvConfig;
  storageMetrics: StorageMetrics;
}): Promise<void> {
  collectStorageMetrics(input.registry, input.config, input.storageMetrics);
  await Promise.all([
    collectDatabaseMetrics(input.registry, input.prisma),
    collectRedisMetrics(input.registry, input.redis),
  ]);
}

async function collectDatabaseMetrics(
  registry: MetricsRegistry,
  prisma: PrismaClient,
): Promise<void> {
  const startedAt = process.hrtime.bigint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    registry.set('vaultstack_database_up', 1);
    registry.set(
      'vaultstack_database_latency_seconds',
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );

    const [objects, buckets, activeUploads, multipartJobs, backupCounts] = await Promise.all([
      prisma.storageObject.count({ where: { isDeleted: false } }),
      prisma.bucket.count(),
      prisma.upload.count({
        where: {
          status: {
            in: [UploadStatus.PENDING, UploadStatus.UPLOADING, UploadStatus.COMPLETING],
          },
        },
      }),
      prisma.multipartUpload.count({
        where: {
          status: {
            in: [
              MultipartUploadStatus.INITIATED,
              MultipartUploadStatus.UPLOADING,
              MultipartUploadStatus.COMPLETING,
            ],
          },
        },
      }),
      Promise.all(
        Object.values(BackupJobStatus).map(async (status) => ({
          status,
          count: await prisma.backupJob.count({ where: { status } }),
        })),
      ),
    ]);

    registry.set('vaultstack_objects_total', objects);
    registry.set('vaultstack_buckets_total', buckets);
    registry.set('vaultstack_active_uploads', activeUploads);
    registry.set('vaultstack_multipart_jobs', multipartJobs);
    for (const backupCount of backupCounts) {
      registry.set('vaultstack_backup_jobs', backupCount.count, { status: backupCount.status });
    }
  } catch {
    registry.set('vaultstack_database_up', 0);
  }
}

async function collectRedisMetrics(registry: MetricsRegistry, redis: Redis): Promise<void> {
  const startedAt = process.hrtime.bigint();
  try {
    await redis.ping();
    registry.set('vaultstack_redis_up', 1);
    registry.set(
      'vaultstack_redis_latency_seconds',
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );

    const queueCounts = await Promise.all(
      WORKER_QUEUES.flatMap((queue) =>
        WORKER_STATES.map(async (state) => ({
          queue,
          state,
          count:
            state === 'wait' || state === 'active'
              ? await redis.llen(`bull:${queue}:${state}`)
              : await redis.zcard(`bull:${queue}:${state}`),
        })),
      ),
    );
    for (const queueCount of queueCounts) {
      registry.set('vaultstack_worker_queue_jobs', queueCount.count, {
        queue: queueCount.queue,
        state: queueCount.state,
      });
    }
  } catch {
    registry.set('vaultstack_redis_up', 0);
  }
}

function collectStorageMetrics(
  registry: MetricsRegistry,
  config: EnvConfig,
  storageMetrics: StorageMetrics,
): void {
  const snapshot = storageMetrics.snapshot();
  registry.set('vaultstack_storage_active_uploads', snapshot.activeUploads);

  try {
    const stats = statfsSync(config.STORAGE_LOCAL_ROOT);
    const capacity = stats.blocks * stats.bsize;
    const available = stats.bavail * stats.bsize;
    const used = Math.max(0, capacity - available);
    registry.set('vaultstack_storage_disk_bytes', capacity, { kind: 'capacity' });
    registry.set('vaultstack_storage_disk_bytes', available, { kind: 'available' });
    registry.set('vaultstack_storage_disk_bytes', used, { kind: 'used' });
    registry.set('vaultstack_storage_disk_usage_ratio', capacity === 0 ? 0 : used / capacity);
  } catch {
    registry.set('vaultstack_storage_disk_usage_ratio', 1);
  }
}
