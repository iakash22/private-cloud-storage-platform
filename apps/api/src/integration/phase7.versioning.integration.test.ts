import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORGANIZATION_COOKIE_NAME } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import { authHeaders, pathOf, responseBody } from './helpers.js';

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

interface Tenant {
  headers: Record<string, string>;
  organizationId: string;
}

describe('Phase 7 object versioning and lifecycle', () => {
  let db: TestDatabase | undefined;
  let storageRoot: string;
  let app: ReturnType<typeof createApp>;

  async function register(email: string, organizationName: string): Promise<Tenant> {
    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Owner',
      organizationName,
    });
    expect(response.status).toBe(201);
    const membership = responseBody<{ memberships: { organizationId: string }[] }>(response)
      .memberships[0];
    if (!membership) {
      throw new Error('Expected register response to include a membership');
    }
    return {
      organizationId: membership.organizationId,
      headers: {
        ...authHeaders(response),
        Cookie: `${authHeaders(response).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${membership.organizationId}`,
      },
    };
  }

  async function uploadObject(
    tenant: Tenant,
    bucketId: string,
    key: string,
    body: Buffer,
  ): Promise<{ id: string; versionId: string | null }> {
    const initiated = await request(app)
      .post('/api/v1/storage/uploads/initiate')
      .set(tenant.headers)
      .send({ bucketId, key, contentType: 'text/plain', size: body.length });
    expect(initiated.status).toBe(201);
    const { upload, uploadUrl } = responseBody<{
      upload: { id: string };
      uploadUrl: string;
    }>(initiated);
    const put = await request(app)
      .put(pathOf(uploadUrl))
      .set('Content-Type', 'text/plain')
      .send(body);
    expect(put.status).toBe(200);
    const completed = await request(app)
      .post(`/api/v1/storage/uploads/${upload.id}/complete`)
      .set(tenant.headers)
      .send({ checksumSha256: createHash('sha256').update(body).digest('hex') });
    expect(completed.status).toBe(201);
    return responseBody<{ object: { id: string; versionId: string | null } }>(completed).object;
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase7-'));
    app = createApp({
      config: createTestConfig({
        DATABASE_URL: db.databaseUrl,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        LOGIN_RATE_LIMIT_MAX: 100,
      }),
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
      prisma: db.prisma,
      clients: { prisma: db.prisma, redis: createMockRedis() },
      rateLimiter: createMemoryRateLimiter(),
    });
  }, 180_000);

  afterAll(async () => {
    await db?.stop();
    await rm(storageRoot, { recursive: true, force: true }).catch(() => undefined);
  }, 60_000);

  it('uploads v1 and v2, lists versions, restores v1, and uses a delete marker', async () => {
    const tenant = await register('version-owner@example.com', 'Version Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name: 'versioned', versioning: 'ENABLED' });
    expect(created.status).toBe(201);
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;

    const first = await uploadObject(tenant, bucketId, 'note.txt', Buffer.from('v1'));
    const second = await uploadObject(tenant, bucketId, 'note.txt', Buffer.from('v2'));
    expect(first.id).toBe(second.id);
    expect(second.versionId).not.toBe(first.versionId);

    const listed = await request(app)
      .get(`/api/v1/storage/objects/${second.id}/versions`)
      .set(tenant.headers);
    expect(listed.status).toBe(200);
    const versions = responseBody<{ versions: { versionId: string; isCurrent: boolean }[] }>(
      listed,
    ).versions;
    expect(versions).toHaveLength(2);
    expect(versions[0]?.isCurrent).toBe(true);

    const restored = await request(app)
      .post(`/api/v1/storage/objects/${second.id}/versions/${first.versionId}/restore`)
      .set(tenant.headers);
    expect(restored.status).toBe(200);
    expect(responseBody<{ object: { versionId: string } }>(restored).object.versionId).not.toBe(
      first.versionId,
    );

    const deleted = await request(app)
      .delete(`/api/v1/storage/objects/${second.id}`)
      .set(tenant.headers);
    expect(deleted.status).toBe(204);

    const hidden = await request(app)
      .get(`/api/v1/storage/objects/${second.id}`)
      .set(tenant.headers);
    expect(hidden.status).toBe(404);

    const afterDelete = await request(app)
      .get(`/api/v1/storage/objects/${second.id}/versions`)
      .set(tenant.headers);
    expect(afterDelete.status).toBe(200);
    expect(
      responseBody<{ versions: { isDeleteMarker: boolean }[] }>(afterDelete).versions.some(
        (version) => version.isDeleteMarker,
      ),
    ).toBe(true);
  });

  it('denies cross-organization version access', async () => {
    const owner = await register('ver-owner@example.com', 'Ver Owner Org');
    const attacker = await register('ver-attacker@example.com', 'Ver Attacker Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(owner.headers)
      .send({ name: 'private-versions', versioning: 'ENABLED' });
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;
    const object = await uploadObject(owner, bucketId, 'secret.txt', Buffer.from('secret'));

    const listed = await request(app)
      .get(`/api/v1/storage/objects/${object.id}/versions`)
      .set(attacker.headers);
    expect(listed.status).toBe(404);

    const restored = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/versions/${object.versionId}/restore`)
      .set(attacker.headers);
    expect(restored.status).toBe(404);
  });

  it('evaluates an expiration policy against an aged current object', async () => {
    const tenant = await register('lifecycle-owner@example.com', 'Lifecycle Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name: 'aging' });
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;
    const object = await uploadObject(tenant, bucketId, 'old.txt', Buffer.from('expire me'));

    const policy = await request(app)
      .post('/api/v1/storage/policies')
      .set(tenant.headers)
      .send({
        name: 'expire-current',
        bucketId,
        days: 1,
        lifecycleAction: 'EXPIRE_CURRENT',
      });
    expect(policy.status).toBe(201);

    await db!.prisma.storageObject.update({
      where: { id: object.id },
      data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    await db!.prisma.objectVersion.updateMany({
      where: { objectId: object.id },
      data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    const { createAppContainer } = await import('../container/app-container.js');
    const container = createAppContainer(
      db!.prisma,
      createTestConfig({
        DATABASE_URL: db!.databaseUrl,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
      }),
      { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
    );

    const result = await container.storage.policies.applyDuePolicies();
    expect(result.expiredCurrent).toBeGreaterThanOrEqual(1);

    const gone = await request(app)
      .get(`/api/v1/storage/objects/${object.id}`)
      .set(tenant.headers);
    expect(gone.status).toBe(404);
  });
});
