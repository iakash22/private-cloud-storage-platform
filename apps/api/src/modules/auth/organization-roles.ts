import type { Prisma, PrismaClient } from '@vaultstack/database';
import { ALL_PERMISSIONS, MEMBER_PERMISSIONS, type PermissionKey } from '@vaultstack/types';

type RoleDb = PrismaClient | Prisma.TransactionClient;

export async function createDefaultOrganizationRoles(
  prisma: RoleDb,
  organizationId: string,
): Promise<{ ownerRoleId: string; memberRoleId: string }> {
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  const owner = await prisma.role.create({
    data: {
      organizationId,
      name: 'Owner',
      description: 'Full access to organization resources',
      isSystem: true,
      permissions: {
        create: ALL_PERMISSIONS.flatMap((key) => {
          const permissionId = permissionByKey.get(key);
          return permissionId ? [{ permissionId }] : [];
        }),
      },
    },
  });

  const member = await prisma.role.create({
    data: {
      organizationId,
      name: 'Member',
      description: 'Read-only access to organization resources',
      isSystem: true,
      permissions: {
        create: MEMBER_PERMISSIONS.flatMap((key: PermissionKey) => {
          const permissionId = permissionByKey.get(key);
          return permissionId ? [{ permissionId }] : [];
        }),
      },
    },
  });

  return { ownerRoleId: owner.id, memberRoleId: member.id };
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
