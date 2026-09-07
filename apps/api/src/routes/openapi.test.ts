import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@vaultstack/database';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createTestConfig } from '../lib/test-config.js';

const testConfig = createTestConfig({
  DATABASE_URL: 'postgresql://vaultstack:vaultstack_dev@localhost:5432/vaultstack',
});

function createMockClients(): DependencyClients {
  return {
    prisma: {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      $disconnect: vi.fn(),
    } as unknown as PrismaClient,
    redis: {
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    } as unknown as DependencyClients['redis'],
  };
}

function createTestApp() {
  const clients = createMockClients();
  return createApp({
    config: testConfig,
    logger: { error: vi.fn(), info: vi.fn() } as never,
    prisma: clients.prisma,
    clients,
  });
}

describe('OpenAPI routes', () => {
  it('serves the OpenAPI JSON document', async () => {
    const response = await request(createTestApp()).get('/api/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('VaultStack API');
    expect(response.body.paths).toBeDefined();
  });

  it('serves Swagger UI at /api/docs', async () => {
    const response = await request(createTestApp()).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });
});
