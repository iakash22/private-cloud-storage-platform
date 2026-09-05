import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  applyMigrations,
  createPrismaClient,
  seedPermissions,
  type PrismaClient,
} from '@vaultstack/database';

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  prisma: PrismaClient;
  databaseUrl: string;
  stop: () => Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('vaultstack_test')
    .withUsername('vaultstack')
    .withPassword('vaultstack_test')
    .start();

  const databaseUrl = container.getConnectionUri();
  await applyMigrations(databaseUrl);

  const prisma = createPrismaClient(databaseUrl);
  await seedPermissions(prisma);

  return {
    container,
    prisma,
    databaseUrl,
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
