import { hashPassword, signAccessToken, verifyPassword } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { uniqueSlug } from '@vaultstack/database';
import { conflict, unauthorized } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeOrganization, serializeUser } from '../../lib/serializers.js';
import { createDefaultOrganizationRoles, getUserOrganizationIds } from './organization-roles.js';

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

export function createAuthService(prisma: PrismaClient, jwtSecret: string, nodeEnv: string) {
  return {
    async register(
      input: RegisterInput,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
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
            roleId: roles.ownerRoleId,
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

      const token = await signAccessToken(result.user.id, jwtSecret);
      return {
        token,
        tokenType: 'Bearer' as const,
        user: serializeUser(result.user),
        organization: serializeOrganization(result.organization),
      };
    },

    async login(input: LoginInput) {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw unauthorized('Invalid email or password');
      }

      const organizationIds = await getUserOrganizationIds(prisma, user.id);
      const organizations = await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        orderBy: { name: 'asc' },
      });

      const token = await signAccessToken(user.id, jwtSecret);
      return {
        token,
        tokenType: 'Bearer' as const,
        user: serializeUser(user),
        organizations: organizations.map(serializeOrganization),
      };
    },

    async me(userId: string) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw unauthorized('Invalid session');
      }

      const organizationIds = await getUserOrganizationIds(prisma, userId);
      const organizations = await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        orderBy: { name: 'asc' },
      });

      return {
        user: serializeUser(user),
        organizations: organizations.map(serializeOrganization),
      };
    },
  };
}
