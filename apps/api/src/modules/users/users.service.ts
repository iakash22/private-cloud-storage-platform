import { hashPassword } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { SYSTEM_ROLES } from '@vaultstack/types';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeUser } from '../../lib/serializers.js';
import { createPrismaPermissionResolver } from '../auth/authorization.service.js';
import { countSuperAdmins, isOrganizationSuperAdmin } from '../auth/organization-roles.js';
import { canAssignSystemRole, canGrantPermissions } from '../auth/rbac.js';

async function getRolePermissionKeys(prisma: PrismaClient, roleId: string): Promise<string[]> {
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  });
  return role?.permissions.map((item) => item.permission.key) ?? [];
}

export function createUsersService(prisma: PrismaClient, nodeEnv: string) {
  return {
    async list(organizationId: string) {
      const assignments = await prisma.userRole.findMany({
        where: { organizationId },
        include: { user: true },
      });

      const uniqueUsers = new Map(assignments.map((item) => [item.user.id, item.user]));
      return [...uniqueUsers.values()]
        .sort((left, right) => left.email.localeCompare(right.email))
        .map(serializeUser);
    },

    async getInOrganization(organizationId: string, userId: string) {
      const membership = await prisma.userRole.findFirst({
        where: { organizationId, userId },
        include: { user: true },
      });

      if (!membership) {
        throw notFound('User not found in this organization');
      }

      return serializeUser(membership.user);
    },

    async create(
      organizationId: string,
      input: { email: string; password: string; name: string; roleId?: string },
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw conflict('A user with that email already exists');
      }

      const role =
        input.roleId === undefined
          ? await prisma.role.findFirst({
              where: { organizationId, name: SYSTEM_ROLES.VIEWER, isSystem: true },
            })
          : await prisma.role.findFirst({
              where: { id: input.roleId, organizationId },
            });

      if (!role) {
        throw notFound('Role not found in this organization');
      }

      const actorPermissions = await createPrismaPermissionResolver(prisma).getPermissionKeys(
        actorUserId,
        organizationId,
      );
      const actorIsSuperAdmin = await isOrganizationSuperAdmin(prisma, actorUserId, organizationId);
      const targetPermissions = await getRolePermissionKeys(prisma, role.id);

      if (
        !canAssignSystemRole(actorIsSuperAdmin, role.name, role.isSystem) ||
        !canGrantPermissions(actorPermissions, actorIsSuperAdmin, targetPermissions)
      ) {
        throw forbidden('You cannot grant that role');
      }

      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password, nodeEnv),
          name: input.name,
          userRoles: {
            create: {
              roleId: role.id,
              organizationId,
            },
          },
        },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'user.created',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: user.email, roleId: role.id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeUser(user);
    },

    async update(
      organizationId: string,
      userId: string,
      input: { name?: string; password?: string; disabled?: boolean },
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const membership = await prisma.userRole.findFirst({
        where: { organizationId, userId },
      });
      if (!membership) {
        throw notFound('User not found in this organization');
      }

      if (input.disabled === true && userId === actorUserId) {
        throw forbidden('You cannot disable your own account');
      }

      if (input.disabled === true) {
        const targetIsSuperAdmin = await isOrganizationSuperAdmin(prisma, userId, organizationId);
        const actorIsSuperAdmin = await isOrganizationSuperAdmin(
          prisma,
          actorUserId,
          organizationId,
        );
        if (targetIsSuperAdmin && !actorIsSuperAdmin) {
          throw forbidden('Only SUPER_ADMIN can disable a SUPER_ADMIN');
        }
        if (targetIsSuperAdmin && (await countSuperAdmins(prisma, organizationId)) <= 1) {
          throw forbidden('Cannot disable the last SUPER_ADMIN');
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          passwordHash: input.password ? await hashPassword(input.password, nodeEnv) : undefined,
          disabledAt: input.disabled === undefined ? undefined : input.disabled ? new Date() : null,
        },
      });

      if (input.disabled === true) {
        await prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: input.disabled === true ? 'user.disabled' : 'user.updated',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeUser(user);
    },
  };
}
