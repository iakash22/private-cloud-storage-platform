import { statfs } from 'node:fs/promises';
import type { EnvConfig } from '@vaultstack/config';
import type { InfrastructureCollectorStatus, PublicDiskMetrics, PublicDiskVolume } from '@vaultstack/types';
import type { DiskCollector } from '../domain/collectors.js';

export class StatfsDiskCollector implements DiskCollector {
  constructor(private readonly config: EnvConfig) {}

  async collect(): Promise<PublicDiskMetrics> {
    const extras = (this.config.INFRASTRUCTURE_DISK_PATHS ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    const paths = uniquePaths([this.config.STORAGE_LOCAL_ROOT, '/', ...extras]);
    const volumes = await Promise.all(
      paths.map((path) =>
        this.readVolume(path, path === this.config.STORAGE_LOCAL_ROOT ? 'storage_root' : 'filesystem'),
      ),
    );
    return { collectedAt: new Date().toISOString(), volumes };
  }

  private async readVolume(
    path: string,
    kind: PublicDiskVolume['kind'],
  ): Promise<PublicDiskVolume> {
    try {
      const stats = await statfs(path);
      const totalBytes = Number(stats.blocks) * Number(stats.bsize);
      const freeBytes = Number(stats.bavail) * Number(stats.bsize);
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const usedPercent =
        totalBytes === 0 ? 0 : Number(((usedBytes / totalBytes) * 100).toFixed(2));
      return {
        path,
        kind,
        status: 'ok',
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent,
        error: null,
      };
    } catch (error) {
      return {
        path,
        kind,
        status: 'unavailable',
        totalBytes: null,
        usedBytes: null,
        freeBytes: null,
        usedPercent: null,
        error: error instanceof Error ? error.message : 'Unable to read filesystem',
      };
    }
  }
}

export function diskStatus(volumes: PublicDiskVolume[]): InfrastructureCollectorStatus {
  if (volumes.length === 0) {
    return 'unavailable';
  }
  if (volumes.every((volume) => volume.status === 'unavailable')) {
    return 'unavailable';
  }
  if (volumes.some((volume) => volume.status !== 'ok')) {
    return 'degraded';
  }
  return 'ok';
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}
