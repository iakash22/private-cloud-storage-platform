import type { Prisma, PrismaClient } from '@vaultstack/database';
import {
  ALL_SYSTEM_ROLES,
  SYSTEM_ROLE_DESCRIPTIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRoleName,
} from '@vaultstack/types';

type RoleDb = PrismaClient | Prisma.TransactionClient;

export async function createDefaultOrganizationRoles(
  prisma: RoleDb,
  organizationId: string,
): Promise<Record<SystemRoleName, string>> {
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
  const roleIds = {} as Record<SystemRoleName, string>;

  for (const name of ALL_SYSTEM_ROLES) {
    const role = await prisma.role.create({
      data: {
        organizationId,
        name,
        description: SYSTEM_ROLE_DESCRIPTIONS[name],
        isSystem: true,
        permissions: {
          create: SYSTEM_ROLE_PERMISSIONS[name].flatMap((key) => {
            const permissionId = permissionByKey.get(key);
            return permissionId ? [{ permissionId }] : [];
          }),
        },
      },
    });
    roleIds[name] = role.id;
  }

  return roleIds;
}

export async function getUserOrganizationIds(
  prisma: PrismaClient,
  userId: string,
): Promise<string[]> {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });

  return assignments.map((assignment) => assignment.organizationId);
}

export async function userHasSystemRole(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
  roleName: string,
): Promise<boolean> {
  const assignment = await prisma.userRole.findFirst({
    where: {
      userId,
      organizationId,
      role: { name: roleName, isSystem: true },
    },
  });
  return assignment !== null;
}

export async function isOrganizationSuperAdmin(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  return userHasSystemRole(prisma, userId, organizationId, SYSTEM_ROLES.SUPER_ADMIN);
}

export async function countSuperAdmins(
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> {
  return prisma.userRole.count({
    where: {
      organizationId,
      role: { name: SYSTEM_ROLES.SUPER_ADMIN, isSystem: true },
    },
  });
}
