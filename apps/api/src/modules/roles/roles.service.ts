import type { PrismaClient } from '@vaultstack/database';
import { ALL_SYSTEM_ROLES } from '@vaultstack/types';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeRole } from '../../lib/serializers.js';
import { createPrismaPermissionResolver } from '../auth/authorization.service.js';
import { countSuperAdmins, isOrganizationSuperAdmin } from '../auth/organization-roles.js';
import { canAssignSystemRole, canGrantPermissions, isSuperAdminRole } from '../auth/rbac.js';

const roleInclude = {
  permissions: {
    include: { permission: true },
  },
} as const;

export function createRolesService(prisma: PrismaClient) {
  return {
    async list(organizationId: string) {
      const roles = await prisma.role.findMany({
        where: { organizationId },
        include: roleInclude,
        orderBy: { name: 'asc' },
      });
      return roles.map(serializeRole);
    },

    async get(organizationId: string, roleId: string) {
      const role = await prisma.role.findFirst({
        where: { id: roleId, organizationId },
        include: roleInclude,
      });
      if (!role) {
        throw notFound('Role not found');
      }
      return serializeRole(role);
    },

    async create(
      organizationId: string,
      input: { name: string; description?: string; permissions: string[] },
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      if ((ALL_SYSTEM_ROLES as readonly string[]).includes(input.name)) {
        throw forbidden('System role names are reserved');
      }

      const existing = await prisma.role.findFirst({
        where: { organizationId, name: input.name },
      });
      if (existing) {
        throw conflict('A role with that name already exists');
      }

      const permissionRecords = await prisma.permission.findMany({
        where: { key: { in: input.permissions } },
      });
      if (permissionRecords.length !== input.permissions.length) {
        throw validationError('One or more permissions are invalid');
      }

      const actorPermissions = await createPrismaPermissionResolver(prisma).getPermissionKeys(
        actorUserId,
        organizationId,
      );
      const actorIsSuperAdmin = await isOrganizationSuperAdmin(prisma, actorUserId, organizationId);
      if (!canGrantPermissions(actorPermissions, actorIsSuperAdmin, input.permissions)) {
        throw forbidden('You cannot grant permissions you do not have');
      }

      const role = await prisma.role.create({
        data: {
          organizationId,
          name: input.name,
          description: input.description,
          permissions: {
            create: permissionRecords.map((permission) => ({ permissionId: permission.id })),
          },
        },
        include: roleInclude,
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'role.created',
        resourceType: 'role',
        resourceId: role.id,
        metadata: { name: input.name, permissions: input.permissions },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeRole(role);
    },

    async assign(
      organizationId: string,
      userId: string,
      roleId: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const [role, user] = await Promise.all([
        prisma.role.findFirst({
          where: { id: roleId, organizationId },
          include: roleInclude,
        }),
        prisma.user.findUnique({ where: { id: userId } }),
      ]);

      if (!role) {
        throw notFound('Role not found');
      }
      if (!user) {
        throw notFound('User not found');
      }

      const actorPermissions = await createPrismaPermissionResolver(prisma).getPermissionKeys(
        actorUserId,
        organizationId,
      );
      const actorIsSuperAdmin = await isOrganizationSuperAdmin(prisma, actorUserId, organizationId);
      const targetPermissions = role.permissions.map((item) => item.permission.key);

      if (
        !canAssignSystemRole(actorIsSuperAdmin, role.name, role.isSystem) ||
        !canGrantPermissions(actorPermissions, actorIsSuperAdmin, targetPermissions)
      ) {
        throw forbidden('You cannot assign a role with greater privileges');
      }

      const existing = await prisma.userRole.findUnique({
        where: {
          userId_roleId_organizationId: { userId, roleId, organizationId },
        },
      });
      if (existing) {
        throw conflict('That role is already assigned to the user');
      }

      await prisma.userRole.create({
        data: { userId, roleId, organizationId },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'role.assigned',
        resourceType: 'user',
        resourceId: userId,
        metadata: { roleId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },

    async unassign(
      organizationId: string,
      userId: string,
      roleId: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const existing = await prisma.userRole.findUnique({
        where: {
          userId_roleId_organizationId: { userId, roleId, organizationId },
        },
        include: { role: true },
      });
      if (!existing) {
        throw notFound('Role assignment not found');
      }

      if (isSuperAdminRole(existing.role.name, existing.role.isSystem)) {
        const actorIsSuperAdmin = await isOrganizationSuperAdmin(
          prisma,
          actorUserId,
          organizationId,
        );
        if (!actorIsSuperAdmin) {
          throw forbidden('Only SUPER_ADMIN can remove SUPER_ADMIN');
        }
        if ((await countSuperAdmins(prisma, organizationId)) <= 1) {
          throw forbidden('Cannot remove the last SUPER_ADMIN');
        }
      }

      await prisma.userRole.delete({ where: { id: existing.id } });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'role.unassigned',
        resourceType: 'user',
        resourceId: userId,
        metadata: { roleId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },
  };
}
