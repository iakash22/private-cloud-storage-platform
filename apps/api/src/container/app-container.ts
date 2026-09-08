import { OrganizationsService } from '../modules/organizations/services/organizations.service.js';
import { UsersService } from '../modules/users/services/users.service.js';
import { TeamsService } from '../modules/teams/services/teams.service.js';
import { RolesService } from '../modules/roles/services/roles.service.js';
import { PermissionsService } from '../modules/permissions/services/permissions.service.js';
import { ApiKeysService } from '../modules/auth/services/api-keys.service.js';
import { AuditService } from '../modules/audit/services/audit.service.js';
import { ArtifactsService } from '../modules/artifacts/services/artifacts.service.js';
import { BackupsService } from '../modules/backups/services/backups.service.js';
import { AuthService } from '../modules/auth/services/auth.service.js';
import {
  AuthorizationService,
  createAuthorizationService,
  createPrismaPermissionResolver,
} from '../modules/auth/services/authorization.service.js';
import { AuthenticationService } from '../modules/auth/services/authentication.service.js';
import { SessionManager } from '../modules/auth/services/session.manager.js';
import { StorageModule } from '../modules/storage/storage.module.js';
import {
  createS3CredentialService,
  S3CredentialService,
} from '../modules/s3-gateway/services/s3-credential.service.js';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { bindCookieManager } from '../lib/cookies.js';
import { CookieManager } from '../lib/cookie.manager.js';
import { BACKUP_QUEUE_NAME, enqueueBackupPayload } from '../workers/backup.worker.js';

export interface AppServices {
  sessions: SessionManager;
  authorization: AuthorizationService;
  auth: AuthService;
  organizations: OrganizationsService;
  users: UsersService;
  teams: TeamsService;
  roles: RolesService;
  permissions: PermissionsService;
  apiKeys: ApiKeysService;
  audit: AuditService;
  storage: StorageModule;
  artifacts: ArtifactsService;
  backups: BackupsService;
  s3Credentials: S3CredentialService;
}

/**
 * Composition root for the API. New modules should register dependencies here.
 */
export class AppContainer {
  readonly cookies: CookieManager;
  readonly config: EnvConfig;
  readonly sessions: SessionManager;
  readonly authentication: AuthenticationService;
  readonly authorization: AuthorizationService;
  readonly auth: AuthService;
  readonly organizations: OrganizationsService;
  readonly users: UsersService;
  readonly teams: TeamsService;
  readonly roles: RolesService;
  readonly permissions: PermissionsService;
  readonly apiKeys: ApiKeysService;
  readonly audit: AuditService;
  readonly storage: StorageModule;
  readonly artifacts: ArtifactsService;
  readonly backups: BackupsService;
  readonly s3Credentials: S3CredentialService;

  constructor(
    private readonly prisma: PrismaClient,
    config: EnvConfig,
    private readonly logger: Logger,
  ) {
    this.config = config;
    this.cookies = new CookieManager(config);
    bindCookieManager(this.cookies);

    this.sessions = new SessionManager(prisma, config.JWT_SECRET, config.SESSION_TTL_SECONDS);
    this.authentication = new AuthenticationService(
      prisma,
      this.sessions,
      this.cookies,
      config.JWT_SECRET,
    );
    this.authorization = createAuthorizationService(createPrismaPermissionResolver(prisma));
    this.auth = new AuthService(prisma, this.sessions, config.NODE_ENV);
    this.organizations = new OrganizationsService(prisma);
    this.users = new UsersService(prisma, config.NODE_ENV);
    this.teams = new TeamsService(prisma);
    this.roles = new RolesService(prisma);
    this.permissions = new PermissionsService(prisma);
    this.apiKeys = new ApiKeysService(prisma);
    this.audit = new AuditService(prisma);
    this.storage = new StorageModule({
      prisma,
      config,
      logger,
      authorization: this.authorization,
    });
    this.artifacts = new ArtifactsService(prisma, this.storage);
    this.backups = this.createBackupsService(prisma, config, logger);
    this.s3Credentials = createS3CredentialService(prisma, config.JWT_SECRET);
  }

  private createBackupsService(
    prisma: PrismaClient,
    config: EnvConfig,
    logger: Logger,
  ): BackupsService {
    if (config.NODE_ENV === 'test' || config.BACKUP_PROCESS_INLINE) {
      return new BackupsService(prisma, this.storage, config, logger);
    }

    const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    const queue = new Queue(BACKUP_QUEUE_NAME, { connection: redis });
    return new BackupsService(prisma, this.storage, config, logger, undefined, (payload) =>
      enqueueBackupPayload(queue, payload),
    );
  }
}

/** @deprecated Use AppContainer directly. Kept for incremental migration. */
export function createServices(
  prisma: PrismaClient,
  config: EnvConfig,
  logger: Logger,
): AppServices {
  const container = new AppContainer(prisma, config, logger);
  return {
    sessions: container.sessions,
    authorization: container.authorization,
    auth: container.auth,
    organizations: container.organizations,
    users: container.users,
    teams: container.teams,
    roles: container.roles,
    permissions: container.permissions,
    apiKeys: container.apiKeys,
    audit: container.audit,
    storage: container.storage,
    artifacts: container.artifacts,
    backups: container.backups,
    s3Credentials: container.s3Credentials,
  };
}

export function createAppContainer(
  prisma: PrismaClient,
  config: EnvConfig,
  logger: Logger,
): AppContainer {
  return new AppContainer(prisma, config, logger);
}
