import type {
  PublicDiskMetrics,
  PublicDockerMetrics,
  PublicServerMetrics,
  PublicStorageMonitorMetrics,
} from '@vaultstack/types';

export interface ServerCollector {
  collect(): Promise<PublicServerMetrics>;
}

export interface DiskCollector {
  collect(): Promise<PublicDiskMetrics>;
}

export interface DockerCollector {
  collect(): Promise<PublicDockerMetrics>;
}

export interface StorageMonitorCollector {
  collect(organizationId: string): Promise<PublicStorageMonitorMetrics>;
}
