import type { PrismaClient } from '@vaultstack/database';
import { ALL_SYSTEM_ROLES } from '@vaultstack/types';
import {
  conflict,
  dependencyError,
  forbidden,
  notFound,
  validationError,
} from '../../../lib/errors.js';
import { writeAuditLog } from '../../../lib/audit.js';
import { serializeRole } from '../mappers/role.mapper.js';
import { createPrismaPermissionResolver } from '../../auth/services/authorization.service.js';
import { countSuperAdmins, isOrganizationSuperAdmin } from '../../auth/organization-roles.js';
import { canAssignSystemRole, canGrantPermissions, isSuperAdminRole } from '../../auth/rbac.js';

const roleInclude = {
  permissions: {
    include: { permission: true },
  },
} as const;

export class RolesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      include: roleInclude,
      orderBy: { name: 'asc' },
    });
    return roles.map(serializeRole);
  }

  async get(organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: roleInclude,
    });
    if (!role) {
      throw notFound('Role not found');
    }
    return serializeRole(role);
  }

  async create(
    organizationId: string,
    input: { name: string; description?: string; permissions: string[] },
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    if ((ALL_SYSTEM_ROLES as readonly string[]).includes(input.name)) {
      throw forbidden('System role names are reserved');
    }

    const existing = await this.prisma.role.findFirst({
      where: { organizationId, name: input.name },
    });
    if (existing) {
      throw conflict('A role with that name already exists', {
        name: 'A role with that name already exists',
      });
    }

    const permissionRecords = await this.prisma.permission.findMany({
      where: { key: { in: input.permissions } },
    });
    if (permissionRecords.length !== input.permissions.length) {
      throw validationError('One or more permissions are invalid', {
        permissions: 'One or more permissions are invalid',
      });
    }

    const actorPermissions = await createPrismaPermissionResolver(this.prisma).getPermissionKeys(
      actorUserId,
      organizationId,
    );
    const actorIsSuperAdmin = await isOrganizationSuperAdmin(
      this.prisma,
      actorUserId,
      organizationId,
    );
    if (!canGrantPermissions(actorPermissions, actorIsSuperAdmin, input.permissions)) {
      throw forbidden('You cannot grant permissions you do not have');
    }

    const role = await this.prisma.role.create({
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

    await writeAuditLog(this.prisma, {
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
  }

  async assign(
    organizationId: string,
    userId: string,
    roleId: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const [role, user] = await Promise.all([
      this.prisma.role.findFirst({
        where: { id: roleId, organizationId },
        include: roleInclude,
      }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!role) {
      throw dependencyError('Role not found', { roleId: 'Role not found' });
    }
    if (!user) {
      throw dependencyError('User not found', { userId: 'User not found' });
    }

    const actorPermissions = await createPrismaPermissionResolver(this.prisma).getPermissionKeys(
      actorUserId,
      organizationId,
    );
    const actorIsSuperAdmin = await isOrganizationSuperAdmin(
      this.prisma,
      actorUserId,
      organizationId,
    );
    const targetPermissions = role.permissions.map((item) => item.permission.key);

    if (
      !canAssignSystemRole(actorIsSuperAdmin, role.name, role.isSystem) ||
      !canGrantPermissions(actorPermissions, actorIsSuperAdmin, targetPermissions)
    ) {
      throw forbidden('You cannot assign a role with greater privileges');
    }

    const existing = await this.prisma.userRole.findUnique({
      where: {
        userId_roleId_organizationId: { userId, roleId, organizationId },
      },
    });
    if (existing) {
      throw conflict('That role is already assigned to the user');
    }

    await this.prisma.userRole.create({
      data: { userId, roleId, organizationId },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 'role.assigned',
      resourceType: 'user',
      resourceId: userId,
      metadata: { roleId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async unassign(
    organizationId: string,
    userId: string,
    roleId: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await this.prisma.userRole.findUnique({
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
        this.prisma,
        actorUserId,
        organizationId,
      );
      if (!actorIsSuperAdmin) {
        throw forbidden('Only SUPER_ADMIN can remove SUPER_ADMIN');
      }
      if ((await countSuperAdmins(this.prisma, organizationId)) <= 1) {
        throw forbidden('Cannot remove the last SUPER_ADMIN');
      }
    }

    await this.prisma.userRole.delete({ where: { id: existing.id } });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 'role.unassigned',
      resourceType: 'user',
      resourceId: userId,
      metadata: { roleId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}

export function createRolesService(prisma: PrismaClient): RolesService {
  return new RolesService(prisma);
}
