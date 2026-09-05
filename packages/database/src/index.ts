export { createPrismaClient, Prisma, PrismaClient } from './client.js';
export { applyMigrations, getDatabasePackageRoot } from './migrate.js';
export { PERMISSION_DESCRIPTIONS, SEEDED_PERMISSION_KEYS } from './permissions.js';
export { seedDatabase, seedPermissions } from './seed.js';
export { slugifyName, uniqueSlug } from './slug.js';

export type {
  ApiKey,
  AuditLog,
  Organization,
  Permission,
  Role,
  Team,
  User,
  UserRole,
} from '@prisma/client';
