import {
  ALL_PERMISSIONS,
  ALL_SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRoleName,
} from '@vaultstack/types';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './client.js';
import { loadRootEnv } from './load-root-env.js';
import { PERMISSION_DESCRIPTIONS } from './permissions.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const key of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSION_DESCRIPTIONS[key] },
      create: {
        key,
        description: PERMISSION_DESCRIPTIONS[key],
      },
    });
  }

  await prisma.permission.deleteMany({
    where: { key: { notIn: [...ALL_PERMISSIONS] } },
  });
}

/**
 * Attach missing RolePermission rows for every system role.
 * Safe to re-run: only inserts missing links; does not remove custom grants.
 */
export async function syncSystemRolePermissions(prisma: PrismaClient): Promise<number> {
  const permissions = await prisma.permission.findMany();
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission.id]));

  const missingCatalog = ALL_PERMISSIONS.filter((key) => !permissionByKey.has(key));
  if (missingCatalog.length > 0) {
    throw new Error(
      `Permission catalog incomplete (${missingCatalog.join(', ')}). Run seedPermissions first.`,
    );
  }

  const systemRoles = await prisma.role.findMany({
    where: { isSystem: true, name: { in: [...ALL_SYSTEM_ROLES] } },
    include: { permissions: true },
  });

  let attached = 0;
  for (const role of systemRoles) {
    const expected = SYSTEM_ROLE_PERMISSIONS[role.name as SystemRoleName];
    const existing = new Set(role.permissions.map((entry) => entry.permissionId));
    for (const key of expected) {
      const permissionId = permissionByKey.get(key);
      if (!permissionId || existing.has(permissionId)) {
        continue;
      }

      await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId,
        },
      });
      existing.add(permissionId);
      attached += 1;
    }
  }

  return attached;
}

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  await seedPermissions(prisma);
  await syncSystemRolePermissions(prisma);
}

async function main(): Promise<void> {
  loadRootEnv(join(dirname(fileURLToPath(import.meta.url)), '..'));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
