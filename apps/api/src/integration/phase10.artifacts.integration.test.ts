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

describe('Phase 10 CI/CD artifact storage', () => {
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

  beforeAll(async () => {
    db = await startTestDatabase();
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase10-'));
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

  it('creates a project, build, uploads, lists, downloads, releases, and deletes', async () => {
    const tenant = await register('artifacts@example.com', 'Artifact Org');
    const payload = Buffer.from('release-bundle-bytes');

    const createdProject = await request(app)
      .post('/api/v1/artifacts/projects')
      .set(tenant.headers)
      .send({ name: 'api', description: 'API packages', retentionDays: 30 });
    expect(createdProject.status).toBe(201);
    const project = responseBody<{ project: { id: string; slug: string } }>(createdProject).project;
    expect(project.slug).toMatch(/^api-/);

    const createdBuild = await request(app)
      .post(`/api/v1/artifacts/projects/${project.id}/builds`)
      .set(tenant.headers)
      .send({
        title: 'main #1',
        gitRef: 'refs/heads/main',
        commitSha: 'abc1234',
        status: 'RUNNING',
      });
    expect(createdBuild.status).toBe(201);
    const build = responseBody<{ build: { id: string; number: number; status: string } }>(
      createdBuild,
    ).build;
    expect(build.number).toBe(1);
    expect(build.status).toBe('RUNNING');

    const initiated = await request(app)
      .post(`/api/v1/artifacts/projects/${project.id}/builds/${build.id}/artifacts`)
      .set(tenant.headers)
      .send({
        name: 'app.tar.gz',
        kind: 'BUNDLE',
        fileName: 'app.tar.gz',
        contentType: 'text/plain',
        size: payload.length,
      });
    expect(initiated.status).toBe(201);
    const upload = responseBody<{
      artifact: { id: string; name: string };
      version: { id: string; status: string; storageObjectId: string | null };
      uploadUrl: string;
    }>(initiated);
    expect(upload.artifact.name).toBe('app.tar.gz');
    expect(upload.version.status).toBe('PENDING');
    expect(upload.version.storageObjectId).toBeNull();

    const put = await request(app)
      .put(pathOf(upload.uploadUrl))
      .set('Content-Type', 'text/plain')
      .send(payload);
    expect(put.status).toBe(200);

    const completed = await request(app)
      .post(`/api/v1/artifacts/versions/${upload.version.id}/complete`)
      .set(tenant.headers)
      .send({ checksumSha256: createHash('sha256').update(payload).digest('hex') });
    expect(completed.status).toBe(201);
    const version = responseBody<{
      version: {
        id: string;
        status: string;
        storageObjectId: string | null;
        isCurrent: boolean;
        size: number;
      };
    }>(completed).version;
    expect(version.status).toBe('AVAILABLE');
    expect(version.isCurrent).toBe(true);
    expect(version.storageObjectId).toBeTruthy();
    expect(version.size).toBe(payload.length);

    const listed = await request(app)
      .get(`/api/v1/artifacts/projects/${project.id}/builds/${build.id}/artifacts`)
      .set(tenant.headers);
    expect(listed.status).toBe(200);
    const artifacts = responseBody<{
      artifacts: { id: string; currentVersion: { id: string } | null }[];
    }>(listed).artifacts;
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.currentVersion?.id).toBe(version.id);

    const download = await request(app)
      .post(`/api/v1/artifacts/versions/${version.id}/download-url`)
      .set(tenant.headers)
      .send({});
    expect(download.status).toBe(200);
    const url = responseBody<{ download: { url: string } }>(download).download.url;
    expect(url).toContain('/api/v1/storage/objects/');

    const content = await request(app).get(pathOf(url));
    expect(content.status).toBe(200);
    expect(content.text).toBe(payload.toString());

    const released = await request(app)
      .post(`/api/v1/artifacts/versions/${version.id}/release`)
      .set(tenant.headers)
      .send({ releaseTag: 'v1.0.0' });
    expect(released.status).toBe(200);
    expect(
      responseBody<{ version: { isRelease: boolean; releaseTag: string } }>(released).version,
    ).toEqual(expect.objectContaining({ isRelease: true, releaseTag: 'v1.0.0' }));

    const releases = await request(app)
      .get(`/api/v1/artifacts/projects/${project.id}/releases`)
      .set(tenant.headers);
    expect(releases.status).toBe(200);
    expect(responseBody<{ releases: { releaseTag: string }[] }>(releases).releases).toHaveLength(1);

    const duplicateRelease = await request(app)
      .post(`/api/v1/artifacts/projects/${project.id}/builds/${build.id}/artifacts`)
      .set(tenant.headers)
      .send({ name: 'notes.log', kind: 'LOG', size: 4 });
    const second = responseBody<{ version: { id: string }; uploadUrl: string }>(duplicateRelease);
    await request(app).put(pathOf(second.uploadUrl)).send(Buffer.from('log\n'));
    const secondComplete = await request(app)
      .post(`/api/v1/artifacts/versions/${second.version.id}/complete`)
      .set(tenant.headers)
      .send({});
    expect(secondComplete.status).toBe(201);
    const conflicted = await request(app)
      .post(`/api/v1/artifacts/versions/${second.version.id}/release`)
      .set(tenant.headers)
      .send({ releaseTag: 'v1.0.0' });
    expect(conflicted.status).toBe(409);
    expect(errorBody(conflicted).code).toBe('ARTIFACT_RELEASE_CONFLICT');

    const deleted = await request(app)
      .delete(`/api/v1/artifacts/versions/${version.id}`)
      .set(tenant.headers);
    expect(deleted.status).toBe(204);

    const missing = await request(app)
      .get(`/api/v1/artifacts/versions/${version.id}`)
      .set(tenant.headers);
    expect(missing.status).toBe(404);
    expect(errorBody(missing).code).toBe('ARTIFACT_VERSION_NOT_FOUND');

    const objectGone = await request(app)
      .get(`/api/v1/storage/objects/${version.storageObjectId}`)
      .set(tenant.headers);
    expect(objectGone.status).toBe(404);
  });

  it('isolates projects across organizations and forbids viewer uploads', async () => {
    const owner = await register('artifact-owner@example.com', 'Owner Artifacts');
    const other = await register('artifact-other@example.com', 'Other Artifacts');

    const created = await request(app)
      .post('/api/v1/artifacts/projects')
      .set(owner.headers)
      .send({ name: 'private' });
    const projectId = responseBody<{ project: { id: string } }>(created).project.id;

    const cross = await request(app)
      .get(`/api/v1/artifacts/projects/${projectId}`)
      .set(other.headers);
    expect(cross.status).toBe(404);
    expect(errorBody(cross).code).toBe('ARTIFACT_PROJECT_NOT_FOUND');

    const createdUser = await request(app)
      .post(`/api/v1/organizations/${owner.organizationId}/users`)
      .set(owner.headers)
      .send({
        email: 'artifact-viewer@example.com',
        password: 'password123',
        name: 'Viewer',
      });
    expect(createdUser.status).toBe(201);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'artifact-viewer@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    const viewerHeaders = {
      ...authHeaders(login),
      Cookie: `${authHeaders(login).Cookie}; ${ORGANIZATION_COOKIE_NAME}=${owner.organizationId}`,
    };

    const forbidden = await request(app)
      .post('/api/v1/artifacts/projects')
      .set(viewerHeaders)
      .send({ name: 'should-fail' });
    expect(forbidden.status).toBe(403);
    expect(errorBody(forbidden).code).toBe('FORBIDDEN');

    const readable = await request(app)
      .get(`/api/v1/artifacts/projects/${projectId}`)
      .set(viewerHeaders);
    expect(readable.status).toBe(200);
  });
});
