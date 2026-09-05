import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import type { EnvConfig } from '@vaultstack/config';
import { PERMISSIONS } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import { apiErrorResponseSchema } from '@vaultstack/validation';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import {
  createAuthorizationService,
  createPrismaPermissionResolver,
} from '../modules/auth/authorization.service.js';

const testConfig: EnvConfig = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgresql://vaultstack:vaultstack_test@localhost:5432/vaultstack_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'phase1-test-jwt-secret-value-32chars',
  MINIO_PORT: 9000,
  MINIO_USE_SSL: false,
};

const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

const publicOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const registerResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
  organization: publicOrganizationSchema,
});

const userResponseSchema = z.object({
  user: publicUserSchema,
});

const rolesResponseSchema = z.object({
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
});

const roleResponseSchema = z.object({
  role: z.object({ id: z.string(), name: z.string() }),
});

const organizationResponseSchema = z.object({
  organization: publicOrganizationSchema,
});

const auditLogsResponseSchema = z.object({
  auditLogs: z.array(z.object({ id: z.string() })),
});

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

describe('Phase 1 backend foundation', () => {
  let db: TestDatabase | undefined;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = await startTestDatabase();
    app = createApp({
      config: { ...testConfig, DATABASE_URL: db.databaseUrl },
      logger: { error: vi.fn(), info: vi.fn() } as never,
      prisma: db.prisma,
      clients: {
        prisma: db.prisma,
        redis: createMockRedis(),
      },
    });
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  }, 60_000);

  it('connects to PostgreSQL', async () => {
    if (!db) {
      throw new Error('Test database was not started');
    }
    const rows = await db.prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(rows[0]?.ok).toBe(1);
  });

  it('applies migrations and seeds permissions', async () => {
    if (!db) {
      throw new Error('Test database was not started');
    }
    const tables = await db.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('User', 'Organization', 'Role', 'Permission', 'UserRole', 'ApiKey', 'AuditLog', 'Team')
    `;

    expect(tables).toHaveLength(8);
    await expect(db.prisma.permission.count()).resolves.toBeGreaterThan(0);
  });

  it('creates an organization and owner user, then enforces RBAC and tenancy', async () => {
    if (!db) {
      throw new Error('Test database was not started');
    }

    const registerA = await request(app).post('/api/v1/auth/register').send({
      email: 'owner-a@example.com',
      password: 'password123',
      name: 'Owner A',
      organizationName: 'Org Alpha',
    });
    const registeredA = registerResponseSchema.parse(registerA.body);

    expect(registerA.status).toBe(201);
    expect(registeredA.token).toBeTruthy();
    expect(registeredA.user.email).toBe('owner-a@example.com');
    expect(registeredA.organization.name).toBe('Org Alpha');

    const createdUser = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users`)
      .set('Authorization', `Bearer ${registeredA.token}`)
      .send({
        email: 'member-a@example.com',
        password: 'password123',
        name: 'Member A',
      });
    const member = userResponseSchema.parse(createdUser.body);

    expect(createdUser.status).toBe(201);
    expect(member.user.email).toBe('member-a@example.com');

    const rolesResponse = await request(app)
      .get(`/api/v1/organizations/${registeredA.organization.id}/roles`)
      .set('Authorization', `Bearer ${registeredA.token}`);
    const roles = rolesResponseSchema.parse(rolesResponse.body);
    const memberRole = roles.roles.find((role) => role.name === 'Member');

    const customRoleResponse = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/roles`)
      .set('Authorization', `Bearer ${registeredA.token}`)
      .send({
        name: 'User Admin',
        description: 'Can create users',
        permissions: [
          PERMISSIONS.USERS_READ,
          PERMISSIONS.USERS_CREATE,
          PERMISSIONS.ORGANIZATIONS_READ,
        ],
      });
    const customRole = roleResponseSchema.parse(customRoleResponse.body);

    expect(customRoleResponse.status).toBe(201);
    expect(memberRole).toBeDefined();

    const assignRole = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users/${member.user.id}/roles`)
      .set('Authorization', `Bearer ${registeredA.token}`)
      .send({ roleId: customRole.role.id });

    expect(assignRole.status).toBe(204);

    const authorization = createAuthorizationService(createPrismaPermissionResolver(db.prisma));
    await expect(
      authorization.can({ id: registeredA.user.id }, PERMISSIONS.USERS_CREATE, {
        type: 'organization',
        organizationId: registeredA.organization.id,
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.can({ id: member.user.id }, PERMISSIONS.USERS_CREATE, {
        type: 'organization',
        organizationId: registeredA.organization.id,
      }),
    ).resolves.toBe(true);

    const registerB = await request(app).post('/api/v1/auth/register').send({
      email: 'owner-b@example.com',
      password: 'password123',
      name: 'Owner B',
      organizationName: 'Org Beta',
    });
    const registeredB = registerResponseSchema.parse(registerB.body);

    expect(registerB.status).toBe(201);

    const crossRead = await request(app)
      .get(`/api/v1/organizations/${registeredA.organization.id}`)
      .set('Authorization', `Bearer ${registeredB.token}`);
    const forbidden = apiErrorResponseSchema.parse(crossRead.body);

    expect(crossRead.status).toBe(403);
    expect(forbidden.error.code).toBe('FORBIDDEN');
    expect(forbidden.requestId).toBeTruthy();

    const crossCreate = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users`)
      .set('Authorization', `Bearer ${registeredB.token}`)
      .send({
        email: 'intruder@example.com',
        password: 'password123',
        name: 'Intruder',
      });

    expect(crossCreate.status).toBe(403);

    await expect(
      authorization.can({ id: registeredB.user.id }, PERMISSIONS.USERS_CREATE, {
        type: 'organization',
        organizationId: registeredA.organization.id,
      }),
    ).resolves.toBe(false);

    const ownRead = await request(app)
      .get(`/api/v1/organizations/${registeredB.organization.id}`)
      .set('Authorization', `Bearer ${registeredB.token}`);
    const ownOrganization = organizationResponseSchema.parse(ownRead.body);
    expect(ownRead.status).toBe(200);
    expect(ownOrganization.organization.id).toBe(registeredB.organization.id);

    const auditLogs = await request(app)
      .get(`/api/v1/organizations/${registeredA.organization.id}/audit-logs`)
      .set('Authorization', `Bearer ${registeredA.token}`);
    const logs = auditLogsResponseSchema.parse(auditLogs.body);
    expect(auditLogs.status).toBe(200);
    expect(logs.auditLogs.length).toBeGreaterThan(0);
  });
});
