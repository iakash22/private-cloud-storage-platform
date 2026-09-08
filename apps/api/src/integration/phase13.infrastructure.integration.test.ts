import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORGANIZATION_COOKIE_NAME, PERMISSIONS, SYSTEM_ROLES } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import { authHeaders, errorBody, responseBody } from './helpers.js';
import type {
  PublicDiskMetrics,
  PublicDockerMetrics,
  PublicInfrastructureSummary,
  PublicServerMetrics,
  PublicStorageMonitorMetrics,
} from '@vaultstack/types';

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

describe('Phase 13 infrastructure monitoring', () => {
  let db: TestDatabase | undefined;
  let storageRoot: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase13-'));
    const config = createTestConfig({
      DATABASE_URL: db.databaseUrl,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: storageRoot,
      LOGIN_RATE_LIMIT_MAX: 100,
      DOCKER_SOCKET: '/tmp/vaultstack-phase13-no-docker.sock',
      INFRASTRUCTURE_DISK_PATHS: join(storageRoot, 'missing-disk'),
    });
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;
    app = createApp({
      config,
      logger,
      prisma: db.prisma,
      clients: { prisma: db.prisma, redis: createMockRedis() },
      rateLimiter: createMemoryRateLimiter(),
    });
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
    await rm(storageRoot, { recursive: true, force: true }).catch(() => undefined);
  });

  async function register(email: string) {
    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Owner',
      organizationName: 'Infra Org',
    });
    expect(response.status).toBe(201);
    const body = responseBody<{
      user: { id: string };
      organization: { id: string };
      memberships: { organizationId: string }[];
    }>(response);
    const organizationId = body.memberships[0]?.organizationId ?? body.organization.id;
    return {
      organizationId,
      userId: body.user.id,
      headers: {
        ...authHeaders(response),
        Cookie: `${authHeaders(response).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${organizationId}`,
      },
    };
  }

  it('authorizes infrastructure.read and never exposes a shell endpoint', async () => {
    const owner = await register(`infra-owner-${Date.now()}@example.com`);

    const summary = await request(app).get('/api/v1/infrastructure/summary').set(owner.headers);
    expect(summary.status).toBe(200);

    const roles = await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/roles`)
      .set(owner.headers);
    const storageAdmin = responseBody<{ roles: { id: string; name: string }[] }>(roles).roles.find(
      (role) => role.name === SYSTEM_ROLES.STORAGE_ADMIN,
    );
    expect(storageAdmin).toBeDefined();

    const memberEmail = `infra-member-${Date.now()}@example.com`;
    const created = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/users`)
      .set(owner.headers)
      .send({
        email: memberEmail,
        password: 'password123',
        name: 'Member',
        roleId: storageAdmin!.id,
      });
    expect(created.status).toBe(201);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: memberEmail,
      password: 'password123',
    });
    expect(login.status).toBe(200);
    const memberHeaders = {
      ...authHeaders(login),
      Cookie: `${authHeaders(login).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${owner.organizationId}`,
    };

    const forbidden = await request(app).get('/api/v1/infrastructure/server').set(memberHeaders);
    expect(forbidden.status).toBe(403);
    expect(errorBody(forbidden).code).toBe('FORBIDDEN');

    const exec = await request(app).post('/api/v1/exec').set(owner.headers).send({ command: 'id' });
    const shell = await request(app).post('/api/v1/shell').set(owner.headers).send({ command: 'id' });
    expect(exec.status).toBe(404);
    expect(shell.status).toBe(404);
    expect(PERMISSIONS.INFRASTRUCTURE_READ).toBe('infrastructure.read');
  });

  it('returns accurate host metrics, disk failure, docker unavailable, and provider health', async () => {
    const owner = await register(`infra-metrics-${Date.now()}@example.com`);
    await writeFile(join(storageRoot, 'probe.txt'), 'ok');

    const server = await request(app).get('/api/v1/infrastructure/server').set(owner.headers);
    expect(server.status).toBe(200);
    const host = responseBody<{ server: PublicServerMetrics }>(server).server;
    expect(host.cpu.cores).toBe(cpus().length);
    expect(host.memory.totalBytes).toBe(totalmem());

    const disks = await request(app).get('/api/v1/infrastructure/disks').set(owner.headers);
    expect(disks.status).toBe(200);
    const volumes = responseBody<{ disks: PublicDiskMetrics }>(disks).disks.volumes;
    const root = volumes.find((volume) => volume.kind === 'storage_root');
    expect(root?.status).toBe('ok');
    expect(root?.freeBytes).toBeGreaterThan(0);
    const failed = volumes.find((volume) => volume.path.endsWith('missing-disk'));
    expect(failed?.status).toBe('unavailable');

    const docker = await request(app).get('/api/v1/infrastructure/docker').set(owner.headers);
    expect(docker.status).toBe(200);
    expect(responseBody<{ docker: PublicDockerMetrics }>(docker).docker.available).toBe(false);

    const storage = await request(app).get('/api/v1/infrastructure/storage').set(owner.headers);
    expect(storage.status).toBe(200);
    const usage = responseBody<{ storage: PublicStorageMonitorMetrics }>(storage).storage;
    expect(usage.objectCount).toBe(0);
    expect(usage.providers.length).toBeGreaterThan(0);
    expect(usage.providers.every((provider) => provider.healthy)).toBe(true);
    expect(usage.storageRoot.status).toBe('ok');

    const summary = await request(app).get('/api/v1/infrastructure/summary').set(owner.headers);
    expect(summary.status).toBe(200);
    const body = responseBody<{ summary: PublicInfrastructureSummary }>(summary).summary;
    expect(body.server.cpuCores).toBe(cpus().length);
    expect(body.disks.status).toBe('degraded');
    expect(body.docker.available).toBe(false);
    expect(body.storage.unhealthyProviders).toBe(0);
  });
});
