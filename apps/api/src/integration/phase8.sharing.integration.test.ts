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
import { authHeaders, errorBody, pathOf, responseBody } from './helpers.js';

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
  userId: string;
}

describe('Phase 8 secure file sharing', () => {
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
    const body = responseBody<{
      user: { id: string };
      memberships: { organizationId: string }[];
    }>(response);
    const membership = body.memberships[0];
    if (!membership) {
      throw new Error('Expected register response to include a membership');
    }
    return {
      organizationId: membership.organizationId,
      userId: body.user.id,
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
  ): Promise<{ id: string }> {
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
    return responseBody<{ object: { id: string } }>(completed).object;
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase8-'));
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

  it('serves a valid public link through a short-lived download URL', async () => {
    const tenant = await register('share-valid@example.com', 'Share Valid Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name: 'shared' });
    expect(created.status).toBe(201);
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;
    const payload = Buffer.from('shared-bytes');
    const object = await uploadObject(tenant, bucketId, 'docs/note.txt', payload);

    const shareResponse = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK', allowView: true, allowDownload: true });
    expect(shareResponse.status).toBe(201);
    const share = responseBody<{ share: { token: string; id: string; fileName: string } }>(
      shareResponse,
    ).share;
    expect(share.token).toMatch(/^vs_sh_[a-f0-9]{64}$/);
    expect(share.fileName).toBe('note.txt');
    expect(JSON.stringify(shareResponse.body)).not.toContain('physicalKey');
    expect(JSON.stringify(shareResponse.body)).not.toMatch(/\/tmp\//);

    const listed = await request(app).get('/api/v1/storage/shares').set(tenant.headers);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(share.token);

    const inspected = await request(app).get(`/api/v1/public/shares/${share.token}`);
    expect(inspected.status).toBe(200);
    expect(
      responseBody<{ passwordRequired: boolean; share: { fileName: string } }>(inspected),
    ).toEqual(
      expect.objectContaining({
        passwordRequired: false,
        share: expect.objectContaining({ fileName: 'note.txt' }),
      }),
    );

    const download = await request(app)
      .post(`/api/v1/public/shares/${share.token}/download-url`)
      .send({});
    expect(download.status).toBe(200);
    const url = responseBody<{ download: { url: string } }>(download).download.url;
    expect(url).toContain('/api/v1/storage/objects/');
    expect(url).not.toContain('physicalKey');

    const content = await request(app).get(pathOf(url));
    expect(content.status).toBe(200);
    expect(content.text).toBe(payload.toString());
  });

  it('rejects expired, revoked, wrong-password, limited, unauthorized, cross-org, and deleted shares', async () => {
    const tenant = await register('share-deny@example.com', 'Share Deny Org');
    const other = await register('share-other@example.com', 'Share Other Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(tenant.headers)
      .send({ name: 'deny-bucket', versioning: 'ENABLED' });
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;
    const object = await uploadObject(tenant, bucketId, 'locked.txt', Buffer.from('secret'));

    const guessing = await request(app).get(
      '/api/v1/public/shares/vs_sh_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    );
    expect(guessing.status).toBe(404);
    expect(errorBody(guessing).code).toBe('SHARE_LINK_NOT_FOUND');

    const unauthorized = await request(app)
      .post('/api/v1/storage/objects/missing-object/shares')
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK' });
    expect(unauthorized.status).toBe(404);
    expect(errorBody(unauthorized).code).toBe('STORAGE_OBJECT_NOT_FOUND');

    const crossOrg = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(other.headers)
      .send({ visibility: 'PUBLIC_LINK' });
    expect(crossOrg.status).toBe(404);
    expect(errorBody(crossOrg).code).toBe('STORAGE_OBJECT_NOT_FOUND');

    const expiredCreate = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK' });
    const expiredShare = responseBody<{ share: { id: string; token: string } }>(
      expiredCreate,
    ).share;
    await db?.prisma.shareLink.update({
      where: { id: expiredShare.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    const expired = await request(app).get(`/api/v1/public/shares/${expiredShare.token}`);
    expect(expired.status).toBe(410);
    expect(errorBody(expired).code).toBe('SHARE_LINK_EXPIRED');

    const revokedCreate = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK' });
    const revokedShare = responseBody<{ share: { id: string; token: string } }>(
      revokedCreate,
    ).share;
    const revokedDelete = await request(app)
      .delete(`/api/v1/storage/shares/${revokedShare.id}`)
      .set(tenant.headers);
    expect(revokedDelete.status).toBe(204);
    const revoked = await request(app).get(`/api/v1/public/shares/${revokedShare.token}`);
    expect(revoked.status).toBe(403);
    expect(errorBody(revoked).code).toBe('SHARE_LINK_REVOKED');

    const passwordCreate = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK', password: 'sharepass1' });
    const passwordShare = responseBody<{ share: { token: string } }>(passwordCreate).share;
    const locked = await request(app).get(`/api/v1/public/shares/${passwordShare.token}`);
    expect(locked.status).toBe(200);
    expect(responseBody<{ passwordRequired: boolean; share: null }>(locked).passwordRequired).toBe(
      true,
    );
    const wrong = await request(app)
      .post(`/api/v1/public/shares/${passwordShare.token}/unlock`)
      .send({ password: 'wrong-password' });
    expect(wrong.status).toBe(403);
    expect(errorBody(wrong).code).toBe('SHARE_PASSWORD_INVALID');

    const limitedCreate = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK', maxDownloads: 1 });
    const limitedShare = responseBody<{ share: { token: string } }>(limitedCreate).share;
    const first = await request(app)
      .post(`/api/v1/public/shares/${limitedShare.token}/download-url`)
      .send({});
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/v1/public/shares/${limitedShare.token}/download-url`)
      .send({});
    expect(second.status).toBe(403);
    expect(errorBody(second).code).toBe('SHARE_DOWNLOAD_LIMIT_REACHED');

    const deletedCreate = await request(app)
      .post(`/api/v1/storage/objects/${object.id}/shares`)
      .set(tenant.headers)
      .send({ visibility: 'PUBLIC_LINK' });
    const deletedShare = responseBody<{ share: { token: string } }>(deletedCreate).share;
    const removed = await request(app)
      .delete(`/api/v1/storage/objects/${object.id}`)
      .set(tenant.headers);
    expect(removed.status).toBe(204);
    const deleted = await request(app).get(`/api/v1/public/shares/${deletedShare.token}`);
    expect(deleted.status).toBe(404);
    expect(errorBody(deleted).code).toBe('STORAGE_OBJECT_NOT_FOUND');
  });

  it('enforces private, team, and organization visibility', async () => {
    const owner = await register('share-scope-owner@example.com', 'Share Scope Org');
    const created = await request(app)
      .post('/api/v1/storage/buckets')
      .set(owner.headers)
      .send({ name: 'scope-bucket' });
    const bucketId = responseBody<{ bucket: { id: string } }>(created).bucket.id;
    const object = await uploadObject(owner, bucketId, 'team.txt', Buffer.from('scoped'));

    const outsider = await register('share-scope-out@example.com', 'Outsider Org');

    const invited = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/users`)
      .set(owner.headers)
      .send({
        email: 'share-scope-member@example.com',
        password: 'password123',
        name: 'Member',
      });
    expect(invited.status).toBe(201);
    const memberUserId = responseBody<{ user: { id: string } }>(invited).user.id;
    const memberLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'share-scope-member@example.com',
      password: 'password123',
    });
    expect(memberLogin.status).toBe(200);
    const member: Tenant = {
      organizationId: owner.organizationId,
      userId: memberUserId,
      headers: {
        ...authHeaders(memberLogin),
        Cookie: `${authHeaders(memberLogin).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${owner.organizationId}`,
      },
    };

    const team = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/teams`)
      .set(owner.headers)
      .send({ name: 'Share Team' });
    expect(team.status).toBe(201);
    const teamId = responseBody<{ team: { id: string } }>(team).team.id;
    const added = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/teams/${teamId}/members`)
      .set(owner.headers)
      .send({ userId: memberUserId });
    expect(added.status).toBe(201);

    const privateShare = responseBody<{ share: { token: string } }>(
      await request(app)
        .post(`/api/v1/storage/objects/${object.id}/shares`)
        .set(owner.headers)
        .send({ visibility: 'PRIVATE' }),
    ).share;
    expect((await request(app).get(`/api/v1/public/shares/${privateShare.token}`)).status).toBe(
      401,
    );
    expect(
      (await request(app).get(`/api/v1/public/shares/${privateShare.token}`).set(member.headers))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/public/shares/${privateShare.token}`).set(owner.headers))
        .status,
    ).toBe(200);

    const teamShare = responseBody<{ share: { token: string } }>(
      await request(app)
        .post(`/api/v1/storage/objects/${object.id}/shares`)
        .set(owner.headers)
        .send({ visibility: 'TEAM', teamId }),
    ).share;
    expect(
      (await request(app).get(`/api/v1/public/shares/${teamShare.token}`).set(member.headers))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/public/shares/${teamShare.token}`).set(outsider.headers))
        .status,
    ).toBe(403);

    const orgShare = responseBody<{ share: { token: string } }>(
      await request(app)
        .post(`/api/v1/storage/objects/${object.id}/shares`)
        .set(owner.headers)
        .send({ visibility: 'ORGANIZATION' }),
    ).share;
    expect(
      (await request(app).get(`/api/v1/public/shares/${orgShare.token}`).set(member.headers))
        .status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/public/shares/${orgShare.token}`).set(outsider.headers))
        .status,
    ).toBe(403);
  });
});
