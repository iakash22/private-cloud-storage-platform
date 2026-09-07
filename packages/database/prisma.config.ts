import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaConfig } from 'prisma';
import { loadRootEnv } from './src/load-root-env.js';

// Prisma CLI does not walk up to the monorepo root for `.env`; load it explicitly.
loadRootEnv(join(dirname(fileURLToPath(import.meta.url))));

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
} satisfies PrismaConfig;
