import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { TotpService } from '@vaultstack/auth';
import { PERMISSIONS, SYSTEM_ROLES } from '@vaultstack/types';
import { startTestDatabase, type TestDatabase } from '@vaultstack/testing';
import { createApp } from '../app.js';
import type { DependencyClients } from '../lib/dependencies.js';
import { createMemoryRateLimiter } from '../lib/rate-limit.js';
import { createTestConfig } from '../lib/test-config.js';
import {
  authHeaders,
  cookieHeader,
  errorBody,
  responseBody,
  sessionCookieFlags,
} from './helpers.js';

function createMockRedis(): DependencyClients['redis'] {
  return {
    status: 'ready',
    ping: vi.fn().mockResolvedValue('PONG'),
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
  } as unknown as DependencyClients['redis'];
}

interface PublicUser {
  id: string;
  email: string;
  disabled: boolean;
}

interface AuthSuccessBody {
  token?: string;
  user: PublicUser;
  memberships: { roles: string[] }[];
  organization: { id: string };
}

interface UserBody {
  user: PublicUser;
}

interface RolesBody {
  roles: { id: string; name: string }[];
}

describe('Phase 2 authentication and RBAC', () => {
  let db: TestDatabase | undefined;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    db = await startTestDatabase();
    app = createApp({
      config: createTestConfig({
        DATABASE_URL: db.databaseUrl,
        LOGIN_RATE_LIMIT_MAX: 30,
      }),
      logger: { error: vi.fn(), info: vi.fn() } as never,
      prisma: db.prisma,
      clients: {
        prisma: db.prisma,
        redis: createMockRedis(),
      },
      rateLimiter: createMemoryRateLimiter(),
    });
  }, 120_000);

  afterAll(async () => {
    await db?.stop();
  }, 60_000);

  it('logs in with httpOnly session cookies and returns the current user', async () => {
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: 'session-owner@example.com',
      password: 'password123',
      name: 'Session Owner',
      organizationName: 'Session Org',
    });
    expect(registered.status).toBe(201);
    expect(responseBody<AuthSuccessBody>(registered).token).toBeUndefined();
    expect(sessionCookieFlags(registered)).toContain('HttpOnly');
    expect(sessionCookieFlags(registered)).toContain('SameSite=Lax');

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'password123',
    });
    const loginBody = responseBody<AuthSuccessBody>(login);
    expect(login.status).toBe(200);
    expect(loginBody.token).toBeUndefined();
    expect(loginBody.user.email).toBe('session-owner@example.com');
    expect(loginBody.memberships[0]?.roles).toContain(SYSTEM_ROLES.SUPER_ADMIN);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(login));
    const meBody = responseBody<UserBody>(me);
    expect(me.status).toBe(200);
    expect(meBody.user.email).toBe('session-owner@example.com');
    expect(meBody.user.disabled).toBe(false);
  });

  it('rejects an invalid password without leaking whether the user exists', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'wrong-password',
    });

    expect(response.status).toBe(401);
    expect(errorBody(response).code).toBe('UNAUTHORIZED');
    expect(errorBody(response).message).toBe('Invalid email or password');
  });

  it('rejects login and session use for a disabled user', async () => {
    const owner = await request(app).post('/api/v1/auth/register').send({
      email: 'disable-owner@example.com',
      password: 'password123',
      name: 'Disable Owner',
      organizationName: 'Disable Org',
    });
    const ownerHeaders = authHeaders(owner);
    const organizationId = responseBody<AuthSuccessBody>(owner).organization.id;

    const created = await request(app)
      .post(`/api/v1/organizations/${organizationId}/users`)
      .set(ownerHeaders)
      .send({
        email: 'disabled-user@example.com',
        password: 'password123',
        name: 'Disabled User',
      });
    expect(created.status).toBe(201);

    const disable = await request(app)
      .patch(
        `/api/v1/organizations/${organizationId}/users/${responseBody<UserBody>(created).user.id}`,
      )
      .set(ownerHeaders)
      .send({ disabled: true });
    expect(disable.status).toBe(200);
    expect(responseBody<UserBody>(disable).user.disabled).toBe(true);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'disabled-user@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(403);
    expect(errorBody(login).code).toBe('FORBIDDEN');
    expect(errorBody(login).message).toBe('This account is disabled');
  });

  it('logs out, revokes the session, and expires stale sessions', async () => {
    if (!db) {
      throw new Error('Test database was not started');
    }

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'password123',
    });
    const headers = authHeaders(login);
    expect(login.status).toBe(200);

    const logout = await request(app).post('/api/v1/auth/logout').set(headers);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).get('/api/v1/auth/me').set('Cookie', headers.Cookie);
    expect(afterLogout.status).toBe(401);

    const secondLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'password123',
    });
    expect(secondLogin.status).toBe(200);

    await db.prisma.session.updateMany({
      where: { user: { email: 'session-owner@example.com' }, revokedAt: null },
      data: { expiresAt: new Date(0) },
    });

    const expired = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieHeader(secondLogin));
    expect(expired.status).toBe(401);
    expect(errorBody(expired).code).toBe('UNAUTHORIZED');
  });

  it('rotates the session on login to prevent fixation and requires CSRF on mutations', async () => {
    const first = await request(app).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'password123',
    });
    const firstCookie = cookieHeader(first);
    expect(first.status).toBe(200);

    const second = await request(app).post('/api/v1/auth/login').set('Cookie', firstCookie).send({
      email: 'session-owner@example.com',
      password: 'password123',
    });
    expect(second.status).toBe(200);

    const stale = await request(app).get('/api/v1/auth/me').set('Cookie', firstCookie);
    expect(stale.status).toBe(401);

    const fresh = await request(app).get('/api/v1/auth/me').set('Cookie', cookieHeader(second));
    expect(fresh.status).toBe(200);

    const missingCsrf = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader(second));
    expect(missingCsrf.status).toBe(403);
    expect(errorBody(missingCsrf).message).toMatch(/CSRF/);
  });

  it('blocks privilege escalation and cross-organization authorization', async () => {
    const owner = await request(app).post('/api/v1/auth/register').send({
      email: 'rbac-owner@example.com',
      password: 'password123',
      name: 'RBAC Owner',
      organizationName: 'RBAC Org',
    });
    const ownerHeaders = authHeaders(owner);
    const organizationId = responseBody<AuthSuccessBody>(owner).organization.id;

    const other = await request(app).post('/api/v1/auth/register').send({
      email: 'rbac-other@example.com',
      password: 'password123',
      name: 'Other Owner',
      organizationName: 'Other Org',
    });
    const otherHeaders = authHeaders(other);

    const roles = await request(app)
      .get(`/api/v1/organizations/${organizationId}/roles`)
      .set('Cookie', ownerHeaders.Cookie);
    const roleList = responseBody<RolesBody>(roles).roles;
    const adminRole = roleList.find((role) => role.name === SYSTEM_ROLES.ADMIN);
    const superAdmin = roleList.find((role) => role.name === SYSTEM_ROLES.SUPER_ADMIN);
    expect(adminRole).toBeDefined();
    expect(superAdmin).toBeDefined();

    const adminUser = await request(app)
      .post(`/api/v1/organizations/${organizationId}/users`)
      .set(ownerHeaders)
      .send({
        email: 'rbac-admin@example.com',
        password: 'password123',
        name: 'RBAC Admin',
        roleId: adminRole?.id,
      });
    expect(adminUser.status).toBe(201);

    const adminLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'rbac-admin@example.com',
      password: 'password123',
    });
    const adminHeaders = authHeaders(adminLogin);

    const escalateRole = await request(app)
      .post(`/api/v1/organizations/${organizationId}/roles`)
      .set(adminHeaders)
      .send({
        name: 'Escalated',
        permissions: [PERMISSIONS.INFRASTRUCTURE_MANAGE],
      });
    expect(escalateRole.status).toBe(403);

    const assignSuper = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/users/${responseBody<UserBody>(adminUser).user.id}/roles`,
      )
      .set(adminHeaders)
      .send({ roleId: superAdmin?.id });
    expect(assignSuper.status).toBe(403);

    const crossOrg = await request(app)
      .post(`/api/v1/organizations/${organizationId}/users`)
      .set(otherHeaders)
      .send({
        email: 'cross-org@example.com',
        password: 'password123',
        name: 'Cross Org',
      });
    expect(crossOrg.status).toBe(403);
    expect(errorBody(crossOrg).code).toBe('FORBIDDEN');
  });

  it('rate limits repeated login attempts', async () => {
    if (!db) {
      throw new Error('Test database was not started');
    }

    const limitedApp = createApp({
      config: createTestConfig({
        DATABASE_URL: db.databaseUrl,
        LOGIN_RATE_LIMIT_MAX: 2,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: 60,
        API_RATE_LIMIT_MAX: 1_000,
      }),
      logger: { error: vi.fn(), info: vi.fn() } as never,
      prisma: db.prisma,
      clients: {
        prisma: db.prisma,
        redis: createMockRedis(),
      },
      rateLimiter: createMemoryRateLimiter(),
    });

    await request(limitedApp).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'wrong-password',
    });
    await request(limitedApp).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'wrong-password',
    });
    const blocked = await request(limitedApp).post('/api/v1/auth/login').send({
      email: 'session-owner@example.com',
      password: 'wrong-password',
    });

    expect(blocked.status).toBe(429);
    expect(errorBody(blocked).code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('challenges login when TOTP is enabled and completes the session after a valid code', async () => {
    const totp = new TotpService();
    const registered = await request(app).post('/api/v1/auth/register').send({
      email: 'totp-owner@example.com',
      password: 'password123',
      name: 'Totp Owner',
      organizationName: 'Totp Org',
    });
    expect(registered.status).toBe(201);
    const headers = authHeaders(registered);

    const setup = await request(app).post('/api/v1/auth/2fa/setup').set(headers);
    expect(setup.status).toBe(200);
    const secret = responseBody<{ secret: string }>(setup).secret;
    expect(secret.length).toBeGreaterThan(10);

    const enabled = await request(app)
      .post('/api/v1/auth/2fa/enable')
      .set(headers)
      .send({ code: totp.generate(secret) });
    expect(enabled.status).toBe(200);
    expect(responseBody<{ user: { twoFactorEnabled: boolean } }>(enabled).user.twoFactorEnabled).toBe(
      true,
    );
    expect(responseBody<{ backupCodes: string[] }>(enabled).backupCodes).toHaveLength(8);

    await request(app).post('/api/v1/auth/logout').set(headers);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'totp-owner@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(200);
    expect(sessionCookieFlags(login)).toBe('');
    const challenge = responseBody<{ totpRequired: boolean; challengeToken: string }>(login);
    expect(challenge.totpRequired).toBe(true);
    expect(challenge.challengeToken.length).toBeGreaterThan(10);

    const invalid = await request(app).post('/api/v1/auth/login/totp').send({
      challengeToken: challenge.challengeToken,
      code: '000000',
    });
    expect(invalid.status).toBe(401);
    expect(errorBody(invalid).code).toBe('TOTP_INVALID');

    const complete = await request(app).post('/api/v1/auth/login/totp').send({
      challengeToken: challenge.challengeToken,
      code: totp.generate(secret),
    });
    expect(complete.status).toBe(200);
    expect(sessionCookieFlags(complete)).toContain('HttpOnly');
    expect(responseBody<{ user: { twoFactorEnabled: boolean } }>(complete).user.twoFactorEnabled).toBe(
      true,
    );
  });
});
