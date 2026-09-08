import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORGANIZATION_COOKIE_NAME } from '@vaultstack/types';
import {
  startTestDatabase,
  startTestMinio,
  type TestDatabase,
  type TestMinio,
} from '@vaultstack/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import { authHeaders, errorBody, responseBody } from './helpers.js';

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

type Headers = Record<string, string>;

interface Tenant {
  headers: Headers;
  organizationId: string;
}

interface PublicProvider {
  id: string;
  name: string;
  type: string;
  dialect: string | null;
  accessKeyId: string | null;
  hasSecret: boolean;
  credentialsSource: string;
  endpoint: string | null;
}

describe('Phase 9 external storage providers', () => {
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

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase9-'));

    app = createApp({
      config: createTestConfig({
        DATABASE_URL: db.databaseUrl,
        STORAGE_DRIVER: 'local',
        STORAGE_LOCAL_ROOT: storageRoot,
        STORAGE_MAX_OBJECT_SIZE_BYTES: 8 * 1024 * 1024,
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

  it('keeps the local filesystem working without an external provider', async () => {
    const tenant = await register('local-owner@example.com', 'Local Org');

    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name: 'local-bucket' });

    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/v1/storage/providers').set(tenant.headers);
    expect(listed.status).toBe(200);
    const providers = responseBody<{ providers: PublicProvider[] }>(listed).providers;
    expect(providers).toHaveLength(1);
    expect(providers[0]?.type).toBe('LOCAL_FILESYSTEM');
    expect(providers[0]?.dialect).toBeNull();
    expect(JSON.stringify(providers)).not.toContain('secret');
  });

  it('requires authentication for provider routes', async () => {
    const response = await request(app).get('/api/v1/storage/providers');
    expect(response.status).toBe(401);
  });

  it('rejects SSRF endpoints and never returns secrets', async () => {
    const tenant = await register('ssrf-owner@example.com', 'Ssrf Org');

    const loopback = await request(app).post('/api/v1/storage/providers').set(tenant.headers).send({
      name: 'generic-loopback',
      dialect: 'GENERIC',
      endpoint: 'https://127.0.0.1',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'super-secret-value',
    });
    expect(loopback.status).toBe(400);

    const metadata = await request(app).post('/api/v1/storage/providers').set(tenant.headers).send({
      name: 'generic-metadata',
      dialect: 'GENERIC',
      endpoint: 'https://169.254.169.254',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'super-secret-value',
    });
    expect(metadata.status).toBe(400);
    expect(errorBody(metadata).code).toBe('VALIDATION_ERROR');

    const created = await request(app).post('/api/v1/storage/providers').set(tenant.headers).send({
      name: 'aws-default',
      dialect: 'AWS_S3',
      region: 'us-west-2',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'super-secret-value',
    });
    expect(created.status).toBe(201);

    const provider = responseBody<{ provider: PublicProvider }>(created).provider;
    expect(provider.hasSecret).toBe(true);
    expect(provider.accessKeyId).toBe('AKIATEST');
    expect(JSON.stringify(provider)).not.toContain('super-secret-value');
    expect(JSON.stringify(provider)).not.toContain('secretCiphertext');

    const fetched = await request(app)
      .get(`/api/v1/storage/providers/${provider.id}`)
      .set(tenant.headers);
    expect(fetched.status).toBe(200);
    expect(JSON.stringify(fetched.body)).not.toContain('super-secret-value');
  });

  it('hides providers from other organizations', async () => {
    const owner = await register('prov-owner@example.com', 'Provider Owner Org');
    const attacker = await register('prov-attacker@example.com', 'Provider Attacker Org');

    const created = await request(app).post('/api/v1/storage/providers').set(owner.headers).send({
      name: 'private-aws',
      dialect: 'AWS_S3',
      accessKeyId: 'AKIAPRIVATE',
      secretAccessKey: 'private-secret',
    });
    expect(created.status).toBe(201);
    const providerId = responseBody<{ provider: { id: string } }>(created).provider.id;

    const stolen = await request(app)
      .get(`/api/v1/storage/providers/${providerId}`)
      .set(attacker.headers);
    expect(stolen.status).toBe(404);
  });

  describe('MinIO contract (testcontainers, no AWS credentials)', () => {
    let minio: TestMinio | undefined;

    beforeAll(async () => {
      minio = await startTestMinio();
    }, 180_000);

    afterAll(async () => {
      await minio?.stop();
    }, 60_000);

    it('stores MinIO credentials encrypted and reads objects through StorageProvider', async () => {
      if (!minio) {
        throw new Error('MinIO was not started');
      }

      const tenant = await register('minio-owner@example.com', 'Minio Org');

      const created = await request(app)
        .post('/api/v1/storage/providers')
        .set(tenant.headers)
        .send({
          name: 'org-minio',
          dialect: 'MINIO',
          endpoint: minio.endpoint,
          region: minio.region,
          tls: false,
          forcePathStyle: true,
          accessKeyId: minio.accessKey,
          secretAccessKey: minio.secretKey,
        });
      expect(created.status).toBe(201);
      const provider = responseBody<{ provider: PublicProvider }>(created).provider;
      expect(provider.dialect).toBe('MINIO');
      expect(JSON.stringify(provider)).not.toContain(minio.secretKey);

      const health = await request(app)
        .post(`/api/v1/storage/providers/${provider.id}/test`)
        .set(tenant.headers);
      expect(health.status).toBe(200);
      expect(responseBody<{ health: { ok: boolean } }>(health).health.ok).toBe(true);

      const bucket = await request(app).post('/api/v1/storage/buckets').set(tenant.headers).send({
        name: 'minio-bucket',
        storageProviderId: provider.id,
      });
      expect(bucket.status).toBe(201);
      const bucketId = responseBody<{ bucket: { id: string } }>(bucket).bucket.id;

      const body = Buffer.from('phase-9-minio-object');
      const initiated = await request(app)
        .post('/api/v1/storage/uploads/initiate')
        .set(tenant.headers)
        .send({
          bucketId,
          key: 'hello.txt',
          size: body.length,
          contentType: 'text/plain',
        });
      expect(initiated.status).toBe(201);
      const { upload, uploadUrl } = responseBody<{
        upload: { id: string };
        uploadUrl: string;
      }>(initiated);

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body,
      });
      expect(put.status).toBeGreaterThanOrEqual(200);
      expect(put.status).toBeLessThan(300);

      const completed = await request(app)
        .post(`/api/v1/storage/uploads/${upload.id}/complete`)
        .set(tenant.headers)
        .send({});
      expect(completed.status).toBe(201);
    });
  });
});
