import { describe, expect, it } from 'vitest';
import {
  collectStartupStatus,
  parseDockerPsOutput,
  parsePostgresTarget,
  renderStartupBanner,
  sanitizePublicMessage,
  shortStatusDetail,
  shouldPrintStartupBanner,
} from './index.js';

describe('@vaultstack/startup', () => {
  it('never echoes credentials from a database URL', () => {
    const target = parsePostgresTarget(
      'postgresql://vaultstack:super-secret@localhost:5432/vaultstack',
    );

    expect(target).toEqual({ host: 'localhost', port: 5432, database: 'vaultstack' });
    expect(
      sanitizePublicMessage(
        'failed postgresql://vaultstack:super-secret@localhost:5432/vaultstack',
      ),
    ).toBe('failed [redacted-url]');
    expect(
      shortStatusDetail(
        "Invalid `prisma.$queryRaw()` invocation:\n\nCan't reach database server at `localhost:5432`",
      ),
    ).toBe('unreachable');
  });

  it('parses docker ps rows without treating missing containers as up', () => {
    const rows = parseDockerPsOutput(
      'vaultstack-postgres\tUp 2 minutes (healthy)\t0.0.0.0:5432->5432/tcp\nvaultstack-redis\tExited (0) 10 seconds ago\t\n',
    );

    expect(rows.get('vaultstack-postgres')?.status).toContain('Up');
    expect(rows.get('vaultstack-redis')?.status).toContain('Exited');
    expect(rows.get('vaultstack-minio')).toBeUndefined();
  });

  it('collects service, port, and container statistics', async () => {
    const status = await collectStartupStatus({
      serverName: 'VaultStack',
      environment: 'development',
      apiHost: '0.0.0.0',
      apiPort: 3000,
      databaseUrl: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
      redisUrl: 'redis://localhost:6379',
      minioEndpoint: 'localhost',
      minioPort: 9000,
      dashboardPort: 5173,
      checkDatabase: () => Promise.resolve({ ok: true }),
      checkRedis: () => Promise.resolve({ ok: false, message: 'Connection is closed.' }),
      probePort: (_host, port) => Promise.resolve(port === 5173),
      runDocker: () =>
        Promise.resolve(
          [
            'vaultstack-postgres\tUp 4 minutes (healthy)\t0.0.0.0:5432->5432/tcp',
            'vaultstack-redis\tExited (1) 3 seconds ago\t',
          ].join('\n'),
        ),
    });

    expect(status.serverName).toBe('VaultStack');
    expect(status.healthyCount).toBe(3);
    expect(status.dockerAvailable).toBe(true);
    expect(status.services.find((service) => service.name === 'PostgreSQL')?.health).toBe('alive');
    expect(status.services.find((service) => service.name === 'Redis')?.detail).toBe('closed');
    expect(status.ports.find((port) => port.name === 'Dashboard')?.listening).toBe(true);
    expect(
      status.containers.find((container) => container.name === 'vaultstack-redis')?.state,
    ).toBe('down');
  });

  it('renders a named banner without secrets', () => {
    const output = renderStartupBanner(
      {
        serverName: 'VaultStack',
        environment: 'development',
        nodeVersion: 'v22.0.0',
        healthyCount: 2,
        serviceCount: 5,
        dockerAvailable: true,
        services: [
          {
            name: 'API',
            health: 'alive',
            detail: 'development',
            endpoint: '0.0.0.0:3000',
          },
          {
            name: 'PostgreSQL',
            health: 'down',
            detail: 'unreachable',
            endpoint: 'localhost:5432',
            container: {
              name: 'vaultstack-postgres',
              state: 'down',
              detail: 'not created',
            },
          },
        ],
        ports: [
          { name: 'API', endpoint: '0.0.0.0:3000', listening: true },
          { name: 'PostgreSQL', endpoint: 'localhost:5432', listening: false },
        ],
        containers: [{ name: 'vaultstack-postgres', state: 'down', detail: 'not created' }],
      },
      { color: false },
    );

    const lines = output.split('\n');
    const serviceLines = lines.filter(
      (line) => line.includes('0.0.0.0:3000') || line.includes('localhost:5432'),
    );

    expect(output).toContain('VaultStack');
    expect(output).toContain('SERVICE');
    expect(output).toContain('CONTAINERS');
    expect(output).not.toContain('PORTS');
    expect(output).not.toContain('prisma');
    expect(output).not.toContain('vaultstack_dev');
    expect(output).not.toContain('postgresql://');
    expect(serviceLines.every((line) => line.length <= 72)).toBe(true);
  });

  it('skips the banner in test environments unless forced', () => {
    expect(shouldPrintStartupBanner({ NODE_ENV: 'test' })).toBe(false);
    expect(
      shouldPrintStartupBanner({ NODE_ENV: 'development', VAULTSTACK_STARTUP_BANNER: '0' }),
    ).toBe(false);
    expect(shouldPrintStartupBanner({ NODE_ENV: 'development' })).toBe(true);
  });
});
