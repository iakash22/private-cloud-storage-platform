import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import { PERMISSIONS, SYSTEM_ROLES } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import { apiErrorResponseSchema } from '@vaultstack/validation';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createTestConfig } from '../lib/test-config.js';
import {
  createAuthorizationService,
  createPrismaPermissionResolver,
} from '../modules/auth/services/authorization.service.js';
import { authHeaders, responseBody } from './helpers.js';

const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  disabled: z.boolean(),
});

const publicOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const registerResponseSchema = z.object({
  csrfToken: z.string(),
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
  auditLogs: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      result: z.enum(['success', 'failure']),
      requestId: z.string().nullable(),
    }),
  ),
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
      config: createTestConfig({ DATABASE_URL: db.databaseUrl }),
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
        AND tablename IN ('User', 'Organization', 'Role', 'Permission', 'UserRole', 'ApiKey', 'AuditLog', 'Team', 'Session')
    `;

    expect(tables).toHaveLength(9);
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
    const headersA = authHeaders(registerA);

    expect(registerA.status).toBe(201);
    expect(responseBody<{ token?: string }>(registerA).token).toBeUndefined();
    expect(registeredA.user.email).toBe('owner-a@example.com');
    expect(registeredA.organization.name).toBe('Org Alpha');

    const createdUser = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users`)
      .set(headersA)
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
      .set('Cookie', headersA.Cookie);
    const roles = rolesResponseSchema.parse(rolesResponse.body);
    const viewerRole = roles.roles.find((role) => role.name === SYSTEM_ROLES.VIEWER);

    const customRoleResponse = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/roles`)
      .set(headersA)
      .send({
        name: 'User Admin',
        description: 'Can create users',
        permissions: [PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE, PERMISSIONS.AUDIT_READ],
      });
    const customRole = roleResponseSchema.parse(customRoleResponse.body);

    expect(customRoleResponse.status).toBe(201);
    expect(viewerRole).toBeDefined();

    const assignRole = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users/${member.user.id}/roles`)
      .set(headersA)
      .send({ roleId: customRole.role.id });

    expect(assignRole.status).toBe(204);

    const authorization = createAuthorizationService(createPrismaPermissionResolver(db.prisma));
    await expect(
      authorization.can({ id: registeredA.user.id }, PERMISSIONS.USERS_MANAGE, {
        type: 'organization',
        organizationId: registeredA.organization.id,
      }),
    ).resolves.toBe(true);
    await expect(
      authorization.can({ id: member.user.id }, PERMISSIONS.USERS_MANAGE, {
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
    const headersB = authHeaders(registerB);

    expect(registerB.status).toBe(201);

    const crossRead = await request(app)
      .get(`/api/v1/organizations/${registeredA.organization.id}`)
      .set('Cookie', headersB.Cookie);
    const forbiddenBody = apiErrorResponseSchema.parse(crossRead.body);

    expect(crossRead.status).toBe(403);
    expect(forbiddenBody.error.code).toBe('FORBIDDEN');
    expect(forbiddenBody.requestId).toBeTruthy();

    const crossCreate = await request(app)
      .post(`/api/v1/organizations/${registeredA.organization.id}/users`)
      .set(headersB)
      .send({
        email: 'intruder@example.com',
        password: 'password123',
        name: 'Intruder',
      });

    expect(crossCreate.status).toBe(403);

    await expect(
      authorization.can({ id: registeredB.user.id }, PERMISSIONS.USERS_MANAGE, {
        type: 'organization',
        organizationId: registeredA.organization.id,
      }),
    ).resolves.toBe(false);

    const ownRead = await request(app)
      .get(`/api/v1/organizations/${registeredB.organization.id}`)
      .set('Cookie', headersB.Cookie);
    const ownOrganization = organizationResponseSchema.parse(ownRead.body);
    expect(ownRead.status).toBe(200);
    expect(ownOrganization.organization.id).toBe(registeredB.organization.id);

    const auditLogs = await request(app)
      .get(`/api/v1/organizations/${registeredA.organization.id}/audit-logs`)
      .set('Cookie', headersA.Cookie);
    const logs = auditLogsResponseSchema.parse(auditLogs.body);
    expect(auditLogs.status).toBe(200);
    expect(logs.auditLogs.length).toBeGreaterThan(0);
    expect(logs.auditLogs.some((log) => log.action === 'auth.register')).toBe(true);
    expect(logs.auditLogs.every((log) => log.result === 'success')).toBe(true);
    expect(logs.auditLogs.every((log) => log.requestId)).toBe(true);
  });
});
