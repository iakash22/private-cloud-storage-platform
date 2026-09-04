import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { EnvConfig } from '@vaultstack/config';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';

const testConfig: EnvConfig = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: false,
  MINIO_ACCESS_KEY: 'test',
  MINIO_SECRET_KEY: 'test',
  MINIO_BUCKET: 'vaultstack',
};

function createMockClients(): DependencyClients {
  return {
    pgPool: {
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    } as unknown as DependencyClients['pgPool'],
    redis: {
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    } as unknown as DependencyClients['redis'],
    s3: {
      send: vi.fn().mockResolvedValue({}),
      destroy: vi.fn(),
    } as unknown as DependencyClients['s3'],
  };
}

describe('API health routes', () => {
  it('GET /health returns ok', async () => {
    const app = createApp({
      config: testConfig,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      clients: createMockClients(),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('api');
  });

  it('GET /ready returns dependency checks', async () => {
    const app = createApp({
      config: testConfig,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      clients: createMockClients(),
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.checks).toHaveLength(3);
    expect(response.body.status).toBe('ok');
  });

  it('GET /ready returns 503 when a dependency fails', async () => {
    const clients = createMockClients();
    vi.mocked(clients.pgPool.query).mockRejectedValueOnce(new Error('connection refused'));

    const app = createApp({
      config: testConfig,
      logger: { error: vi.fn(), info: vi.fn() } as never,
      clients,
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('error');
  });
});
