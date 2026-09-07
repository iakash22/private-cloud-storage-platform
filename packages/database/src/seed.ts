import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv } from './load-root-env.js';
import { ALL_PERMISSIONS } from '@vaultstack/types';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './client.js';
import { PERMISSION_DESCRIPTIONS } from './permissions.js';

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

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  await seedPermissions(prisma);
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
