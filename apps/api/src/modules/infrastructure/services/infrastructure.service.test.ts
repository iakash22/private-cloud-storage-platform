import { describe, expect, it, vi } from 'vitest';
import type {
  PublicDiskMetrics,
  PublicDockerMetrics,
  PublicServerMetrics,
  PublicStorageMonitorMetrics,
} from '@vaultstack/types';
import { InfrastructureService } from './infrastructure.service.js';
import type { InfrastructureCollectors } from './infrastructure.service.js';

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;

function server(overrides: Partial<PublicServerMetrics['cpu']> = {}): PublicServerMetrics {
  return {
    collectedAt: '2026-09-08T00:00:00.000Z',
    hostname: 'vault',
    platform: 'linux',
    uptimeSeconds: 10,
    cpu: { cores: 4, model: 'test', load1: 0.1, load5: 0.2, load15: 0.3, ...overrides },
    memory: { totalBytes: 100, freeBytes: 40, usedBytes: 60, usedPercent: 60 },
    network: { interfaces: [] },
  };
}

function disks(status: 'ok' | 'unavailable' = 'ok'): PublicDiskMetrics {
  return {
    collectedAt: '2026-09-08T00:00:00.000Z',
    volumes: [
      {
        path: '/data',
        kind: 'storage_root',
        status,
        totalBytes: status === 'ok' ? 100 : null,
        usedBytes: status === 'ok' ? 25 : null,
        freeBytes: status === 'ok' ? 75 : null,
        usedPercent: status === 'ok' ? 25 : null,
        error: status === 'ok' ? null : 'ENOENT',
      },
    ],
  };
}

function storage(healthy: boolean): PublicStorageMonitorMetrics {
  return {
    collectedAt: '2026-09-08T00:00:00.000Z',
    bucketCount: 1,
    objectCount: 3,
    totalBytes: 30,
    uploadsLast24h: 2,
    processUploads: 1,
    processBytesUploaded: 10,
    buckets: [{ bucketId: 'b1', name: 'docs', objectCount: 3, bytes: 30 }],
    providers: [
      {
        id: 'p1',
        name: 'local',
        type: 'LOCAL_FILESYSTEM',
        status: 'ACTIVE',
        healthy,
        message: healthy ? 'Healthy' : 'Provider unavailable',
      },
    ],
    storageRoot: disks().volumes[0]!,
  };
}

function docker(available: boolean): PublicDockerMetrics {
  return {
    collectedAt: '2026-09-08T00:00:00.000Z',
    available,
    message: available ? 'ok' : 'ENOENT',
    serverVersion: available ? '29.0' : null,
    containers: available ? 2 : null,
    containersRunning: available ? 1 : null,
    images: available ? 4 : null,
    items: [],
  };
}

function collectors(input: {
  disks?: PublicDiskMetrics;
  storage?: PublicStorageMonitorMetrics;
  docker?: PublicDockerMetrics;
}): InfrastructureCollectors {
  return {
    server: { collect: async () => server() },
    disks: { collect: async () => input.disks ?? disks() },
    docker: { collect: async () => input.docker ?? docker(true) },
    storage: { collect: async () => input.storage ?? storage(true) },
  };
}

describe('InfrastructureService', () => {
  it('summarizes collector results without executing a shell', async () => {
    const service = new InfrastructureService(collectors({}), logger);
    const summary = await service.summary('org-1');
    expect(summary.server.cpuCores).toBe(4);
    expect(summary.server.memoryUsedPercent).toBe(60);
    expect(summary.storage.objectCount).toBe(3);
    expect(summary.storage.unhealthyProviders).toBe(0);
    expect(summary.docker.available).toBe(true);
  });

  it('surfaces disk failure and unavailable providers', async () => {
    const service = new InfrastructureService(
      collectors({
        disks: disks('unavailable'),
        storage: storage(false),
        docker: docker(false),
      }),
      logger,
    );
    const summary = await service.summary('org-1');
    expect(summary.disks.status).toBe('unavailable');
    expect(summary.storage.unhealthyProviders).toBe(1);
    expect(summary.docker.available).toBe(false);
  });
});
