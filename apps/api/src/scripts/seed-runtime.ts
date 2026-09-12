import { createPrismaClient, seedDatabase } from '@vaultstack/database';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = createPrismaClient(databaseUrl);
  try {
    await seedDatabase(prisma);
    process.stdout.write('VaultStack permission seed complete\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
