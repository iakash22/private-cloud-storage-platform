import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { PrismaClient } from '@vaultstack/database';
import { CSRF_HEADER_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createTestConfig } from '../lib/test-config.js';
import { resolveCorsOrigins } from './cors.js';

function createTestApp(overrides: Parameters<typeof createTestConfig>[0] = {}) {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
  const clients: DependencyClients = {
    prisma,
    redis: {
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
      connect: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue('OK'),
    } as unknown as DependencyClients['redis'],
  };

  return createApp({
    config: createTestConfig(overrides),
    logger: { error: vi.fn(), info: vi.fn() } as never,
    prisma,
    clients,
  });
}

describe('CORS', () => {
  it('defaults to dashboard origins outside production', () => {
    const config = createTestConfig({ NODE_ENV: 'development' });
    expect(resolveCorsOrigins(config)).toEqual(
      new Set(['http://localhost:5173', 'http://127.0.0.1:5173']),
    );
  });

  it('disables CORS in production unless CORS_ORIGINS is set', () => {
    expect(resolveCorsOrigins(createTestConfig({ NODE_ENV: 'production' })).size).toBe(0);
    expect(
      resolveCorsOrigins(
        createTestConfig({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.example.com' }),
      ),
    ).toEqual(new Set(['https://app.example.com']));
  });

  it('allows credentialed preflight from the dashboard origin', async () => {
    const response = await request(createTestApp())
      .options('/api/v1/auth/register')
      .set('Origin', 'http://127.0.0.1:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', `${CSRF_HEADER_NAME}, ${ORGANIZATION_HEADER_NAME}`);

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain(CSRF_HEADER_NAME);
  });

  it('does not reflect disallowed origins', async () => {
    const response = await request(createTestApp())
      .get('/health')
      .set('Origin', 'https://evil.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
