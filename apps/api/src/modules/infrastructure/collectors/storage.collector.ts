import { statfs } from 'node:fs/promises';
import type { PrismaClient } from '@vaultstack/database';
import type { EnvConfig } from '@vaultstack/config';
import type { PublicDiskVolume, PublicStorageMonitorMetrics } from '@vaultstack/types';
import type { StorageModule } from '../../storage/storage.module.js';
import type { StorageMonitorCollector } from '../domain/collectors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export class PrismaStorageMonitorCollector implements StorageMonitorCollector {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageModule,
    private readonly config: EnvConfig,
  ) {}

  async collect(organizationId: string): Promise<PublicStorageMonitorMetrics> {
    await this.storage.storage.defaultProvider(organizationId);
    const [buckets, aggregates, uploadsLast24h, providers, storageRoot] = await Promise.all([
      this.prisma.bucket.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.storageObject.groupBy({
        by: ['bucketId'],
        where: { organizationId, isDeleted: false },
        _count: { _all: true },
        _sum: { size: true },
      }),
      this.prisma.storageObject.count({
        where: { organizationId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
      }),
      this.prisma.storageProvider.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      }),
      readStorageRoot(this.config.STORAGE_LOCAL_ROOT),
    ]);

    const usageByBucket = new Map(
      aggregates.map((row) => [
        row.bucketId,
        { objectCount: row._count._all, bytes: Number(row._sum.size ?? 0) },
      ]),
    );
    const bucketUsage = buckets.map((bucket) => {
      const usage = usageByBucket.get(bucket.id) ?? { objectCount: 0, bytes: 0 };
      return {
        bucketId: bucket.id,
        name: bucket.name,
        objectCount: usage.objectCount,
        bytes: usage.bytes,
      };
    });

    const providerHealth = await Promise.all(
      providers.map(async (row) => {
        try {
          const provider = this.storage.storage.providerFor(row);
          const health = await provider.healthCheck();
          return {
            id: row.id,
            name: row.name,
            type: row.type,
            status: row.status,
            healthy: health.ok,
            message: health.ok ? 'Healthy' : health.message || 'Provider unavailable',
          };
        } catch (error) {
          return {
            id: row.id,
            name: row.name,
            type: row.type,
            status: row.status,
            healthy: false,
            message: error instanceof Error ? error.message : 'Provider unavailable',
          };
        }
      }),
    );

    const process = this.storage.metrics.snapshot();
    const objectCount = bucketUsage.reduce((sum, bucket) => sum + bucket.objectCount, 0);
    const totalBytes = bucketUsage.reduce((sum, bucket) => sum + bucket.bytes, 0);

    return {
      collectedAt: new Date().toISOString(),
      bucketCount: buckets.length,
      objectCount,
      totalBytes,
      uploadsLast24h,
      processUploads: process.uploads,
      processBytesUploaded: process.bytesUploaded,
      buckets: bucketUsage,
      providers: providerHealth,
      storageRoot,
    };
  }
}

async function readStorageRoot(path: string): Promise<PublicDiskVolume> {
  try {
    const stats = await statfs(path);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      path,
      kind: 'storage_root',
      status: 'ok',
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent: totalBytes === 0 ? 0 : Number(((usedBytes / totalBytes) * 100).toFixed(2)),
      error: null,
    };
  } catch (error) {
    return {
      path,
      kind: 'storage_root',
      status: 'unavailable',
      totalBytes: null,
      usedBytes: null,
      freeBytes: null,
      usedPercent: null,
      error: error instanceof Error ? error.message : 'Unable to read storage root',
    };
  }
}
