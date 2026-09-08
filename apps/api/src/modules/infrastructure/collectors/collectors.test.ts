import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../../lib/test-config.js';
import { StatfsDiskCollector, diskStatus } from './disk.collector.js';
import { DockerSocketCollector } from './docker.collector.js';
import { OsServerCollector } from './server.collector.js';
import { PrismaStorageMonitorCollector } from './storage.collector.js';

describe('infrastructure collectors', () => {
  it('reports accurate host CPU and memory totals', async () => {
    const { cpus, totalmem } = await import('node:os');
    const metrics = await new OsServerCollector().collect();
    expect(metrics.cpu.cores).toBe(cpus().length);
    expect(metrics.memory.totalBytes).toBe(totalmem());
    expect(metrics.memory.usedBytes + metrics.memory.freeBytes).toBe(metrics.memory.totalBytes);
    expect(metrics.network.interfaces.length).toBeGreaterThan(0);
  });

  it('marks a missing disk path as unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vaultstack-disk-ok-'));
    const collector = new StatfsDiskCollector(
      createTestConfig({
        STORAGE_LOCAL_ROOT: root,
        INFRASTRUCTURE_DISK_PATHS: join(root, 'missing-volume'),
      }),
    );
    const metrics = await collector.collect();
    const missing = metrics.volumes.find((volume) => volume.path.endsWith('missing-volume'));
    expect(missing?.status).toBe('unavailable');
    expect(missing?.error).toBeTruthy();
    expect(diskStatus(metrics.volumes)).toBe('degraded');
    await rm(root, { recursive: true, force: true });
  });

  it('reports Docker unavailable when the socket does not exist', async () => {
    const collector = new DockerSocketCollector(
      createTestConfig({ DOCKER_SOCKET: '/tmp/vaultstack-no-docker.sock' }),
    );
    const metrics = await collector.collect();
    expect(metrics.available).toBe(false);
    expect(metrics.items).toEqual([]);
    expect(metrics.message.length).toBeGreaterThan(0);
  });

  it('marks a storage provider unavailable when healthCheck fails', async () => {
    const prisma = {
      bucket: { findMany: async () => [] },
      storageObject: {
        groupBy: async () => [],
        count: async () => 0,
      },
      storageProvider: {
        findMany: async () => [
          { id: 'p1', name: 'remote', type: 'S3_COMPATIBLE', status: 'ACTIVE' },
        ],
      },
    };
    const storage = {
      storage: {
        defaultProvider: async () => undefined,
        providerFor: () => ({
          healthCheck: async () => ({ ok: false, message: 'endpoint unreachable' }),
        }),
      },
      metrics: { snapshot: () => ({ uploads: 0, bytesUploaded: 0 }) },
    };
    const collector = new PrismaStorageMonitorCollector(
      prisma as never,
      storage as never,
      createTestConfig({ STORAGE_LOCAL_ROOT: '/tmp/vaultstack-missing-storage-root' }),
    );
    const metrics = await collector.collect('org-1');
    expect(metrics.providers).toEqual([
      expect.objectContaining({
        id: 'p1',
        healthy: false,
        message: 'endpoint unreachable',
      }),
    ]);
  });
});
