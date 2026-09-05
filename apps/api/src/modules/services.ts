import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { createAuditService } from './audit/audit.service.js';
import { createApiKeysService } from './auth/api-keys.service.js';
import { createAuthService } from './auth/auth.service.js';
import {
  createAuthorizationService,
  createPrismaPermissionResolver,
} from './auth/authorization.service.js';
import { createSessionService } from './auth/session.service.js';
import { createOrganizationsService } from './organizations/organizations.service.js';
import { createPermissionsService } from './permissions/permissions.service.js';
import { createRolesService } from './roles/roles.service.js';
import { createStorageServices } from './storage/storage.services.js';
import { createTeamsService } from './teams/teams.service.js';
import { createUsersService } from './users/users.service.js';

export function createServices(prisma: PrismaClient, config: EnvConfig, logger: Logger) {
  const sessions = createSessionService(prisma, config.SESSION_TTL_SECONDS);
  const authorization = createAuthorizationService(createPrismaPermissionResolver(prisma));

  return {
    sessions,
    authorization,
    auth: createAuthService(prisma, sessions, config.NODE_ENV),
    organizations: createOrganizationsService(prisma),
    users: createUsersService(prisma, config.NODE_ENV),
    teams: createTeamsService(prisma),
    roles: createRolesService(prisma),
    permissions: createPermissionsService(prisma),
    apiKeys: createApiKeysService(prisma),
    audit: createAuditService(prisma),
    // Storage reuses the same authorization service, so Phase 2 RBAC remains
    // the single source of truth for permission decisions.
    storage: createStorageServices({ prisma, config, logger, authorization }),
  };
}

export type AppServices = ReturnType<typeof createServices>;
