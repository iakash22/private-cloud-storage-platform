import type { ContainerStatus, DockerRunner } from './docker.js';
import { inspectVaultstackContainers } from './docker.js';
import { probeTcp } from './probe.js';
import {
  formatEndpoint,
  parsePostgresTarget,
  parseRedisTarget,
  shortStatusDetail,
} from './redact.js';

export type ServiceHealth = 'alive' | 'down' | 'unknown';

export interface HealthProbe {
  ok: boolean;
  message?: string;
}

export interface StartupCheckInput {
  serverName: string;
  environment: string;
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  minioEndpoint?: string;
  minioPort: number;
  dashboardPort?: number;
  checkDatabase: () => Promise<HealthProbe>;
  checkRedis: () => Promise<HealthProbe>;
  runDocker?: DockerRunner;
  probePort?: (host: string, port: number) => Promise<boolean>;
}

export interface PortRow {
  name: string;
  endpoint: string;
  listening: boolean;
}

export interface ServiceRow {
  name: string;
  health: ServiceHealth;
  detail: string;
  endpoint: string;
  container?: ContainerStatus;
}

export interface StartupStatus {
  serverName: string;
  environment: string;
  nodeVersion: string;
  healthyCount: number;
  serviceCount: number;
  dockerAvailable: boolean;
  services: ServiceRow[];
  ports: PortRow[];
  containers: ContainerStatus[];
}

function healthFromOk(ok: boolean): ServiceHealth {
  return ok ? 'alive' : 'down';
}

function containerFor(
  containers: ContainerStatus[],
  name: ContainerStatus['name'],
): ContainerStatus | undefined {
  return containers.find((container) => container.name === name);
}

export async function collectStartupStatus(input: StartupCheckInput): Promise<StartupStatus> {
  const probe = input.probePort ?? probeTcp;
  const postgres = parsePostgresTarget(input.databaseUrl);
  const redis = parseRedisTarget(input.redisUrl);
  const minioHost = input.minioEndpoint ?? 'localhost';
  const dashboardPort = input.dashboardPort ?? 5173;

  const [database, cache, docker, dashboardOpen, minioOpen] = await Promise.all([
    input.checkDatabase().catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    })),
    input.checkRedis().catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    })),
    inspectVaultstackContainers(input.runDocker),
    probe('127.0.0.1', dashboardPort),
    probe(minioHost === '0.0.0.0' ? '127.0.0.1' : minioHost, input.minioPort),
  ]);

  const postgresContainer = containerFor(docker.containers, 'vaultstack-postgres');
  const redisContainer = containerFor(docker.containers, 'vaultstack-redis');
  const minioContainer = containerFor(docker.containers, 'vaultstack-minio');

  const services: ServiceRow[] = [
    {
      name: 'API',
      health: 'alive',
      detail: input.environment,
      endpoint: formatEndpoint(input.apiHost, input.apiPort),
    },
    {
      name: 'PostgreSQL',
      health: healthFromOk(database.ok),
      detail: database.ok
        ? `db=${postgres.database}`
        : shortStatusDetail(database.message ?? 'unreachable'),
      endpoint: formatEndpoint(postgres.host, postgres.port),
      container: postgresContainer,
    },
    {
      name: 'Redis',
      health: healthFromOk(cache.ok),
      detail: cache.ok ? 'connected' : shortStatusDetail(cache.message ?? 'unreachable'),
      endpoint: formatEndpoint(redis.host, redis.port),
      container: redisContainer,
    },
    {
      name: 'MinIO',
      health: healthFromOk(minioOpen),
      detail: minioOpen ? 'open' : 'optional',
      endpoint: formatEndpoint(minioHost, input.minioPort),
      container: minioContainer,
    },
    {
      name: 'Dashboard',
      health: healthFromOk(dashboardOpen),
      detail: dashboardOpen ? 'vite' : 'stopped',
      endpoint: formatEndpoint('localhost', dashboardPort),
    },
  ];

  const ports: PortRow[] = [
    {
      name: 'API',
      endpoint: formatEndpoint(input.apiHost, input.apiPort),
      listening: true,
    },
    {
      name: 'PostgreSQL',
      endpoint: formatEndpoint(postgres.host, postgres.port),
      listening: database.ok,
    },
    {
      name: 'Redis',
      endpoint: formatEndpoint(redis.host, redis.port),
      listening: cache.ok,
    },
    {
      name: 'MinIO',
      endpoint: formatEndpoint(minioHost, input.minioPort),
      listening: minioOpen,
    },
    {
      name: 'Dashboard',
      endpoint: formatEndpoint('localhost', dashboardPort),
      listening: dashboardOpen,
    },
  ];

  return {
    serverName: input.serverName,
    environment: input.environment,
    nodeVersion: process.version,
    healthyCount: services.filter((service) => service.health === 'alive').length,
    serviceCount: services.length,
    dockerAvailable: docker.available,
    services,
    ports,
    containers: docker.containers,
  };
}
