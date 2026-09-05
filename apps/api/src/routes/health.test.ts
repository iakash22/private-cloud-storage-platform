import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@vaultstack/database';
import {
  apiErrorResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@vaultstack/validation';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createTestConfig } from '../lib/test-config.js';

const testConfig = createTestConfig({
  DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
});

function createMockClients() {
  const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
  const clients: DependencyClients = {
    prisma: {
      $queryRaw: queryRaw,
      $disconnect: vi.fn(),
    } as unknown as PrismaClient,
    redis: {
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    } as unknown as DependencyClients['redis'],
  };
  return { clients, queryRaw };
}

function createTestApp(clients = createMockClients().clients) {
  return createApp({
    config: testConfig,
    logger: { error: vi.fn(), info: vi.fn() } as never,
    prisma: clients.prisma,
    clients,
  });
}

describe('API health routes', () => {
  it('GET /health returns ok', async () => {
    const response = await request(createTestApp()).get('/health');
    const body = healthResponseSchema.parse(response.body);

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/health returns ok', async () => {
    const response = await request(createTestApp()).get('/api/v1/health');
    const body = healthResponseSchema.parse(response.body);
    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('GET /ready returns postgres and redis checks', async () => {
    const response = await request(createTestApp()).get('/ready');
    const body = readinessResponseSchema.parse(response.body);

    expect(response.status).toBe(200);
    expect(body.checks).toHaveLength(2);
    expect(body.status).toBe('ok');
  });

  it('GET /ready returns 503 when a dependency fails', async () => {
    const { clients, queryRaw } = createMockClients();
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));

    const response = await request(createTestApp(clients)).get('/ready');
    const body = readinessResponseSchema.parse(response.body);

    expect(response.status).toBe(503);
    expect(body.status).toBe('error');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('unknown routes include requestId in the error envelope', async () => {
    const response = await request(createTestApp()).get('/api/v1/missing');
    const body = apiErrorResponseSchema.parse(response.body);

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.requestId).toEqual(response.headers['x-request-id']);
  });
});
