import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PERMISSIONS } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
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

describe('Phase 5 S3 gateway authentication and access control', () => {
  let db: TestDatabase | undefined;
  let storageRoot: string;
  let app: ReturnType<typeof createApp>;
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;

  async function registerOwner(email: string, organizationName: string) {
    const response = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'password123',
      name: 'Owner',
      organizationName,
    });
    expect(response.status).toBe(201);
    return response;
  }

  async function createCredential(
    ownerResponse: request.Response,
    organizationId: string,
    input: {
      serviceAccountName: string;
      permissions: string[];
      allowedBucketNames?: string[];
      expiresAt?: string;
    },
  ) {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/s3-credentials`)
      .set(authHeaders(ownerResponse))
      .send({
        serviceAccountName: input.serviceAccountName,
        permissions: input.permissions,
        allowedBucketNames: input.allowedBucketNames ?? [],
        expiresAt: input.expiresAt,
      });

    expect(response.status).toBe(201);
    return responseBody<{
      credential: { accessKeyId: string; secretAccessKey: string };
    }>(response).credential;
  }

  function createS3Client(credential: { accessKeyId: string; secretAccessKey: string }) {
    return new S3Client({
      region: 'vaultstack',
      endpoint: `${baseUrl}/api/v1/s3`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: credential.accessKeyId,
        secretAccessKey: credential.secretAccessKey,
      },
    });
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase5-'));
    const config = createTestConfig({
      DATABASE_URL: db.databaseUrl,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: storageRoot,
      S3_GATEWAY_ENABLED: true,
      S3_GATEWAY_REGION: 'vaultstack',
      LOGIN_RATE_LIMIT_MAX: 100,
    });

    app = createApp({
      config,
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never,
      prisma: db.prisma,
      clients: {
        prisma: db.prisma,
        redis: createMockRedis(),
      },
      rateLimiter: createMemoryRateLimiter(),
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, config.API_HOST, () => resolve());
    });
    const address = server?.address();
    const port = typeof address === 'object' && address ? address.port : config.API_PORT;
    baseUrl = `http://${config.API_HOST}:${port}`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(storageRoot, { recursive: true, force: true }).catch(() => undefined);
    await db?.stop();
  }, 60_000);

  it('accepts AWS SDK requests signed with valid credentials', async () => {
    const owner = await registerOwner('s3-owner@example.com', 'S3 Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;
    const credential = await createCredential(owner, organizationId, {
      serviceAccountName: 'ci-uploader',
      permissions: [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD, PERMISSIONS.STORAGE_DELETE],
    });

    const client = createS3Client(credential);
    const bucketName = `phase5-bucket-${Date.now()}`;

    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: 'reports/hello.txt',
        Body: 'hello from aws sdk',
        ContentType: 'text/plain',
      }),
    );

    const listed = await client.send(new ListBucketsCommand({}));
    expect(listed.Buckets?.some((bucket) => bucket.Name === bucketName)).toBe(true);

    const downloaded = await client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: 'reports/hello.txt' }),
    );
    expect(await downloaded.Body?.transformToString()).toBe('hello from aws sdk');

    await client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: 'reports/hello.txt' }));
  });

  it('rejects invalid and revoked credentials', async () => {
    const owner = await registerOwner('s3-revoke@example.com', 'Revoke Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;
    const credential = await createCredential(owner, organizationId, {
      serviceAccountName: 'revoke-me',
      permissions: [PERMISSIONS.STORAGE_READ],
    });

    const invalidClient = createS3Client({
      accessKeyId: credential.accessKeyId,
      secretAccessKey: 'invalid-secret',
    });

    await expect(invalidClient.send(new ListBucketsCommand({}))).rejects.toThrow();

    const listed = await request(app)
      .get(`/api/v1/organizations/${organizationId}/s3-credentials`)
      .set(authHeaders(owner));
    const credentialId = responseBody<{ credentials: { id: string; accessKeyId: string }[] }>(listed)
      .credentials[0]?.id;
    expect(credentialId).toBeTruthy();

    const revoke = await request(app)
      .post(`/api/v1/organizations/${organizationId}/s3-credentials/${credentialId}/revoke`)
      .set(authHeaders(owner));
    expect(revoke.status).toBe(200);

    const revokedClient = createS3Client(credential);
    await expect(revokedClient.send(new ListBucketsCommand({}))).rejects.toThrow();
  });

  it('enforces read-only credentials and bucket restrictions', async () => {
    const owner = await registerOwner('s3-readonly@example.com', 'Readonly Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;

    const readOnly = await createCredential(owner, organizationId, {
      serviceAccountName: 'reader',
      permissions: [PERMISSIONS.STORAGE_READ],
    });
    const restricted = await createCredential(owner, organizationId, {
      serviceAccountName: 'restricted',
      permissions: [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD],
      allowedBucketNames: ['allowed-bucket'],
    });

    const admin = await createCredential(owner, organizationId, {
      serviceAccountName: 'admin',
      permissions: [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD, PERMISSIONS.STORAGE_DELETE],
    });

    const adminClient = createS3Client(admin);
    await adminClient.send(new CreateBucketCommand({ Bucket: 'allowed-bucket' }));
    await adminClient.send(new CreateBucketCommand({ Bucket: 'other-bucket' }));

    const reader = createS3Client(readOnly);
    await expect(
      reader.send(
        new PutObjectCommand({
          Bucket: 'allowed-bucket',
          Key: 'deny.txt',
          Body: 'nope',
        }),
      ),
    ).rejects.toThrow();

    const restrictedClient = createS3Client(restricted);
    await expect(
      restrictedClient.send(
        new PutObjectCommand({
          Bucket: 'other-bucket',
          Key: 'deny.txt',
          Body: 'nope',
        }),
      ),
    ).rejects.toThrow();
  });

  it('isolates organizations at the bucket layer', async () => {
    const ownerA = await registerOwner('s3-org-a@example.com', 'Org A');
    const orgA = responseBody<{ organization: { id: string } }>(ownerA).organization.id;
    const ownerB = await registerOwner('s3-org-b@example.com', 'Org B');
    const orgB = responseBody<{ organization: { id: string } }>(ownerB).organization.id;

    const credentialA = await createCredential(ownerA, orgA, {
      serviceAccountName: 'org-a',
      permissions: [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD],
    });
    const credentialB = await createCredential(ownerB, orgB, {
      serviceAccountName: 'org-b',
      permissions: [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD],
    });

    const clientA = createS3Client(credentialA);
    const clientB = createS3Client(credentialB);
    const sharedBucket = `shared-name-${Date.now()}`;

    await clientA.send(new CreateBucketCommand({ Bucket: sharedBucket }));
    await clientB.send(new CreateBucketCommand({ Bucket: sharedBucket }));

    await clientA.send(
      new PutObjectCommand({ Bucket: sharedBucket, Key: 'secret.txt', Body: 'org-a-secret' }),
    );

    await expect(
      clientB.send(new GetObjectCommand({ Bucket: sharedBucket, Key: 'secret.txt' })),
    ).rejects.toThrow();
  });

  it('rejects expired credentials', async () => {
    const owner = await registerOwner('s3-expired@example.com', 'Expired Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;
    const credential = await createCredential(owner, organizationId, {
      serviceAccountName: 'expired',
      permissions: [PERMISSIONS.STORAGE_READ],
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const client = createS3Client(credential);
    await expect(client.send(new ListBucketsCommand({}))).rejects.toThrow();
  });

  it('does not expose secrets after creation', async () => {
    const owner = await registerOwner('s3-onetime@example.com', 'One Time Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;

    await createCredential(owner, organizationId, {
      serviceAccountName: 'one-time',
      permissions: [PERMISSIONS.STORAGE_READ],
    });

    const listed = await request(app)
      .get(`/api/v1/organizations/${organizationId}/s3-credentials`)
      .set(authHeaders(owner));
    expect(listed.status).toBe(200);
    const body = responseBody<{ credentials: Record<string, unknown>[] }>(listed);
    expect(body.credentials[0]).not.toHaveProperty('secretAccessKey');
  });

  it('rejects REST credential creation without authorization', async () => {
    const owner = await registerOwner('s3-rest-auth@example.com', 'REST Auth Org');
    const organizationId = responseBody<{ organization: { id: string } }>(owner).organization.id;

    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/s3-credentials`)
      .send({
        serviceAccountName: 'blocked',
        permissions: [PERMISSIONS.STORAGE_READ],
      });

    expect(response.status).toBe(401);
    expect(errorBody(response).code).toBe('UNAUTHORIZED');
  });
});
