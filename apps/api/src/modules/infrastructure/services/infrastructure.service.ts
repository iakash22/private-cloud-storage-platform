import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type {
  PublicDiskMetrics,
  PublicDockerMetrics,
  PublicInfrastructureSummary,
  PublicServerMetrics,
  PublicStorageMonitorMetrics,
} from '@vaultstack/types';
import type { StorageModule } from '../../storage/storage.module.js';
import { StatfsDiskCollector, diskStatus } from '../collectors/disk.collector.js';
import { DockerSocketCollector } from '../collectors/docker.collector.js';
import { OsServerCollector } from '../collectors/server.collector.js';
import { PrismaStorageMonitorCollector } from '../collectors/storage.collector.js';
import type {
  DiskCollector,
  DockerCollector,
  ServerCollector,
  StorageMonitorCollector,
} from '../domain/collectors.js';

export interface InfrastructureCollectors {
  server: ServerCollector;
  disks: DiskCollector;
  docker: DockerCollector;
  storage: StorageMonitorCollector;
}

export class InfrastructureService {
  constructor(
    private readonly collectors: InfrastructureCollectors,
    private readonly logger: Logger,
  ) {}

  static create(
    prisma: PrismaClient,
    storage: StorageModule,
    config: EnvConfig,
    logger: Logger,
    overrides: Partial<InfrastructureCollectors> = {},
  ): InfrastructureService {
    return new InfrastructureService(
      {
        server: overrides.server ?? new OsServerCollector(),
        disks: overrides.disks ?? new StatfsDiskCollector(config),
        docker: overrides.docker ?? new DockerSocketCollector(config),
        storage: overrides.storage ?? new PrismaStorageMonitorCollector(prisma, storage, config),
      },
      logger,
    );
  }

  async summary(organizationId: string): Promise<PublicInfrastructureSummary> {
    const [server, disks, storage, docker] = await Promise.all([
      this.server(),
      this.disks(),
      this.storage(organizationId),
      this.docker(),
    ]);
    return {
      collectedAt: new Date().toISOString(),
      server: {
        status: 'ok',
        cpuCores: server.cpu.cores,
        memoryUsedPercent: server.memory.usedPercent,
      },
      disks: {
        status: diskStatus(disks.volumes),
        volumeCount: disks.volumes.length,
      },
      storage: {
        objectCount: storage.objectCount,
        totalBytes: storage.totalBytes,
        unhealthyProviders: storage.providers.filter((provider) => !provider.healthy).length,
      },
      docker: {
        available: docker.available,
        containersRunning: docker.containersRunning,
      },
    };
  }

  async server(): Promise<PublicServerMetrics> {
    return this.collectors.server.collect();
  }

  async disks(): Promise<PublicDiskMetrics> {
    return this.collectors.disks.collect();
  }

  async storage(organizationId: string): Promise<PublicStorageMonitorMetrics> {
    return this.collectors.storage.collect(organizationId);
  }

  async docker(): Promise<PublicDockerMetrics> {
    const metrics = await this.collectors.docker.collect();
    if (!metrics.available) {
      this.logger.warn({ event: 'infrastructure.docker.unavailable' }, metrics.message);
    }
    return metrics;
  }
}
