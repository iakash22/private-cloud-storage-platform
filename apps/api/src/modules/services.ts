import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import { createAuditService } from './audit/audit.service.js';
import { createApiKeysService } from './auth/api-keys.service.js';
import { createAuthService } from './auth/auth.service.js';
import {
  createAuthorizationService,
  createPrismaPermissionResolver,
} from './auth/authorization.service.js';
import { createOrganizationsService } from './organizations/organizations.service.js';
import { createPermissionsService } from './permissions/permissions.service.js';
import { createRolesService } from './roles/roles.service.js';
import { createTeamsService } from './teams/teams.service.js';
import { createUsersService } from './users/users.service.js';

export function createServices(prisma: PrismaClient, config: EnvConfig) {
  return {
    authorization: createAuthorizationService(createPrismaPermissionResolver(prisma)),
    auth: createAuthService(prisma, config.JWT_SECRET, config.NODE_ENV),
    organizations: createOrganizationsService(prisma),
    users: createUsersService(prisma, config.NODE_ENV),
    teams: createTeamsService(prisma),
    roles: createRolesService(prisma),
    permissions: createPermissionsService(prisma),
    apiKeys: createApiKeysService(prisma),
    audit: createAuditService(prisma),
  };
}

export type AppServices = ReturnType<typeof createServices>;
