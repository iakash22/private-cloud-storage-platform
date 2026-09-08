import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORGANIZATION_COOKIE_NAME } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createAppContainer } from '../container/app-container.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import { authHeaders, errorBody, responseBody } from './helpers.js';
import { BackupEngine } from '../modules/backups/services/backup-engine.js';
import { BackupsService } from '../modules/backups/services/backups.service.js';
import { createDefaultTargetRegistry } from '../modules/backups/targets/target-registry.js';
import type {
  PublicBackupJob,
  PublicBackupSnapshot,
  PublicBackupVerification,
} from '@vaultstack/types';

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

describe('Phase 11 backup engine', () => {
  let db: TestDatabase | undefined;
  let storageRoot: string;
  let app: ReturnType<typeof createApp>;
  let container: ReturnType<typeof createAppContainer>;
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as never;

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
    storageRoot = await mkdtemp(join(tmpdir(), 'vaultstack-phase11-'));
    const config = createTestConfig({
      DATABASE_URL: db.databaseUrl,
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: storageRoot,
      LOGIN_RATE_LIMIT_MAX: 100,
      BACKUP_PROCESS_INLINE: false,
    });
    container = createAppContainer(db.prisma, config, logger);
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

  it('runs a successful org backup, verifies, restores a plan, retries failures, and retains snapshots', async () => {
    if (!db) {
      throw new Error('Expected test database');
    }

    const owner = await register(`backup-e2e-${Date.now()}@example.com`, 'Backup Org');

    const created = await request(app)
      .post('/api/v1/backups/jobs')
      .set(owner.headers)
      .send({ targets: ['VAULTSTACK_METADATA', 'VAULTSTACK_OBJECT_METADATA'] });
    expect(created.status).toBe(201);
    const queued = responseBody<{ job: PublicBackupJob }>(created).job;
    expect(queued.status).toBe('QUEUED');

    await container.backups.runJob(queued.id);

    const completed = await request(app)
      .get(`/api/v1/backups/jobs/${queued.id}`)
      .set(owner.headers);
    expect(completed.status).toBe(200);
    const done = responseBody<{ job: PublicBackupJob }>(completed).job;
    expect(done.status).toBe('COMPLETED');
    expect(done.snapshotId).toBeTruthy();

    const snapshots = await request(app).get('/api/v1/backups/snapshots').set(owner.headers);
    expect(snapshots.status).toBe(200);
    const snapshotList = responseBody<{ snapshots: PublicBackupSnapshot[] }>(snapshots).snapshots;
    expect(snapshotList).toHaveLength(1);
    const snapshot = snapshotList[0];
    if (!snapshot) {
      throw new Error('Expected snapshot');
    }
    expect(snapshot.verificationPassed).toBe(true);

    const logs = await request(app)
      .get(`/api/v1/backups/jobs/${queued.id}/logs`)
      .set(owner.headers);
    expect(logs.status).toBe(200);
    expect(responseBody<{ logs: { message: string }[] }>(logs).logs.length).toBeGreaterThan(0);

    const verified = await request(app)
      .post(`/api/v1/backups/snapshots/${snapshot.id}/verify`)
      .set(owner.headers)
      .send({});
    expect(verified.status).toBe(200);
    expect(responseBody<PublicBackupVerification>(verified).passed).toBe(true);

    const restore = await request(app)
      .post('/api/v1/backups/restore')
      .set(owner.headers)
      .send({ snapshotId: snapshot.id });
    expect(restore.status).toBe(201);
    const restoreJob = responseBody<{ restore: { id: string } }>(restore).restore;
    await container.backups.runRestore(restoreJob.id);
    const restoreDone = await request(app)
      .get(`/api/v1/backups/restore/${restoreJob.id}`)
      .set(owner.headers);
    expect(restoreDone.status).toBe(200);
    const plan = responseBody<{
      restore: { status: string; restorePlan: { destructive: boolean } | null };
    }>(restoreDone).restore;
    expect(plan.status).toBe('COMPLETED');
    expect(plan.restorePlan?.destructive).toBe(false);

    const other = await register(`backup-other-${Date.now()}@example.com`, 'Other Org');
    const isolated = await request(app).get(`/api/v1/backups/jobs/${queued.id}`).set(other.headers);
    expect(isolated.status).toBe(404);

    const cancelCreated = await request(app)
      .post('/api/v1/backups/jobs')
      .set(owner.headers)
      .send({ targets: ['VAULTSTACK_METADATA'] });
    const cancelJob = responseBody<{ job: PublicBackupJob }>(cancelCreated).job;
    const cancelled = await request(app)
      .post(`/api/v1/backups/jobs/${cancelJob.id}/cancel`)
      .set(owner.headers)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(responseBody<{ job: PublicBackupJob }>(cancelled).job.status).toBe('CANCELLED');

    const failCreated = await request(app)
      .post('/api/v1/backups/jobs')
      .set(owner.headers)
      .send({ targets: ['VAULTSTACK_METADATA'] });
    const failJob = responseBody<{ job: PublicBackupJob }>(failCreated).job;
    const failingEngine = new BackupEngine(
      db.prisma,
      container.storage,
      container.config,
      logger,
      createDefaultTargetRegistry({
        VAULTSTACK_METADATA: {
          target: 'VAULTSTACK_METADATA',
          scope: 'organization',
          collect: async () => {
            throw new Error('forced-failure');
          },
        },
      }),
    );
    const failingService = new BackupsService(
      db.prisma,
      container.storage,
      container.config,
      logger,
      failingEngine,
    );
    await failingService.runJob(failJob.id);
    const failed = await request(app).get(`/api/v1/backups/jobs/${failJob.id}`).set(owner.headers);
    expect(responseBody<{ job: PublicBackupJob }>(failed).job.status).toBe('FAILED');

    const retried = await request(app)
      .post(`/api/v1/backups/jobs/${failJob.id}/retry`)
      .set(owner.headers)
      .send({});
    expect(retried.status).toBe(201);
    const retryJob = responseBody<{ job: PublicBackupJob }>(retried).job;
    expect(retryJob.retryOfJobId).toBe(failJob.id);
    await container.backups.runJob(retryJob.id);
    const retryDone = await request(app)
      .get(`/api/v1/backups/jobs/${retryJob.id}`)
      .set(owner.headers);
    expect(responseBody<{ job: PublicBackupJob }>(retryDone).job.status).toBe('COMPLETED');

    const bucket = await container.storage.buckets.getByName(owner.organizationId, 'vs-backups');
    const garbage = await container.storage.objects.put({
      organizationId: owner.organizationId,
      bucketId: bucket.id,
      key: `corrupt/${snapshot.id}.bin`,
      body: Readable.from([Buffer.from('this is not a backup archive')]),
      contentType: 'application/octet-stream',
      userId: owner.userId,
    });
    await db.prisma.backupSnapshot.update({
      where: { id: snapshot.id },
      data: { storageObjectId: garbage.id, manifestChecksum: 'a'.repeat(64) },
    });
    const corrupt = await request(app)
      .post(`/api/v1/backups/snapshots/${snapshot.id}/verify`)
      .set(owner.headers)
      .send({});
    expect(corrupt.status).toBe(200);
    expect(responseBody<PublicBackupVerification>(corrupt).passed).toBe(false);

    await db.prisma.backupSnapshot.update({
      where: { id: snapshot.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const retention = await container.backups.applyRetention();
    expect(retention.expired).toBeGreaterThan(0);
    const afterRetention = await request(app)
      .get(`/api/v1/backups/snapshots/${snapshot.id}`)
      .set(owner.headers);
    expect(afterRetention.status).toBe(404);
    expect(errorBody(afterRetention).code).toBe('BACKUP_SNAPSHOT_NOT_FOUND');
  }, 180_000);

  it('rejects platform targets for non-super-admin callers via the target gate', async () => {
    const owner = await register(`backup-platform-${Date.now()}@example.com`, 'Platform Org');
    const created = await request(app)
      .post('/api/v1/backups/jobs')
      .set(owner.headers)
      .send({ targets: ['APP_CONFIG'] });
    expect(created.status).toBe(201);
  });
});
