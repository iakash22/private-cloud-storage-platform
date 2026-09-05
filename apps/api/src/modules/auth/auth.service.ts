import { hashPassword, verifyPassword } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { uniqueSlug } from '@vaultstack/database';
import type { PublicMembership } from '@vaultstack/types';
import { conflict, forbidden, unauthorized } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeOrganization, serializeUser } from '../../lib/serializers.js';
import { createDefaultOrganizationRoles, getUserOrganizationIds } from './organization-roles.js';
import type { SessionService, SessionTokens } from './session.service.js';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SessionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  previousSessionToken?: string;
}

async function loadMemberships(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  organizations: ReturnType<typeof serializeOrganization>[];
  memberships: PublicMembership[];
}> {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  const organizationIds = [...new Set(assignments.map((item) => item.organizationId))];
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    orderBy: { name: 'asc' },
  });

  const memberships = organizationIds.map((organizationId) => {
    const orgAssignments = assignments.filter((item) => item.organizationId === organizationId);
    return {
      organizationId,
      roles: [...new Set(orgAssignments.map((item) => item.role.name))],
      permissions: [
        ...new Set(
          orgAssignments.flatMap((item) =>
            item.role.permissions.map((entry) => entry.permission.key),
          ),
        ),
      ],
    };
  });

  return {
    organizations: organizations.map(serializeOrganization),
    memberships,
  };
}

export function createAuthService(prisma: PrismaClient, sessions: SessionService, nodeEnv: string) {
  return {
    async register(input: RegisterInput, meta: SessionMeta) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw conflict('A user with that email already exists');
      }

      const passwordHash = await hashPassword(input.password, nodeEnv);
      const slug = uniqueSlug(input.organizationName);

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            name: input.name,
          },
        });

        const organization = await tx.organization.create({
          data: {
            name: input.organizationName,
            slug,
          },
        });

        const roles = await createDefaultOrganizationRoles(tx, organization.id);

        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: roles.SUPER_ADMIN,
            organizationId: organization.id,
          },
        });

        return { user, organization };
      });

      await writeAuditLog(prisma, {
        organizationId: result.organization.id,
        userId: result.user.id,
        action: 'auth.register',
        resourceType: 'organization',
        resourceId: result.organization.id,
        metadata: { email: result.user.email },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      const session = await sessions.create(result.user.id, meta);
      const memberships = await loadMemberships(prisma, result.user.id);

      return {
        user: serializeUser(result.user),
        organization: serializeOrganization(result.organization),
        organizations: memberships.organizations,
        memberships: memberships.memberships,
        csrfToken: session.csrfToken,
        session,
      };
    },

    async login(input: LoginInput, meta: SessionMeta) {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw unauthorized('Invalid email or password');
      }

      if (user.disabledAt) {
        throw forbidden('This account is disabled');
      }

      const session = await sessions.create(user.id, meta, meta.previousSessionToken);
      const memberships = await loadMemberships(prisma, user.id);

      const primaryOrganizationId = memberships.organizations[0]?.id;
      if (primaryOrganizationId) {
        await writeAuditLog(prisma, {
          organizationId: primaryOrganizationId,
          userId: user.id,
          action: 'auth.login',
          resourceType: 'session',
          resourceId: session.sessionId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }

      return {
        user: serializeUser(user),
        organizations: memberships.organizations,
        memberships: memberships.memberships,
        csrfToken: session.csrfToken,
        session,
      };
    },

    async logout(userId: string, sessionId: string | undefined, meta: SessionMeta): Promise<void> {
      if (sessionId) {
        await sessions.revoke(sessionId);
      }

      const organizationIds = await getUserOrganizationIds(prisma, userId);
      const organizationId = organizationIds[0];
      if (organizationId) {
        await writeAuditLog(prisma, {
          organizationId,
          userId,
          action: 'auth.logout',
          resourceType: 'session',
          resourceId: sessionId ?? null,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
      }
    },

    async me(userId: string) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw unauthorized('Invalid session');
      }
      if (user.disabledAt) {
        throw forbidden('This account is disabled');
      }

      const memberships = await loadMemberships(prisma, userId);
      return {
        user: serializeUser(user),
        organizations: memberships.organizations,
        memberships: memberships.memberships,
      };
    },
  };
}

export type IssuedSession = SessionTokens;
