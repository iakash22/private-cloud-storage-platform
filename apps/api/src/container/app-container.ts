import { OrganizationsService } from '../modules/organizations/services/organizations.service.js';
import { UsersService } from '../modules/users/services/users.service.js';
import { TeamsService } from '../modules/teams/services/teams.service.js';
import { RolesService } from '../modules/roles/services/roles.service.js';
import { PermissionsService } from '../modules/permissions/services/permissions.service.js';
import { ApiKeysService } from '../modules/auth/services/api-keys.service.js';
import { AuditService } from '../modules/audit/services/audit.service.js';
import { ArtifactsService } from '../modules/artifacts/services/artifacts.service.js';
import { BackupsService } from '../modules/backups/services/backups.service.js';
import { InfrastructureService } from '../modules/infrastructure/services/infrastructure.service.js';
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
import { Redis } from 'ioredis';
import { Queue } from '../lib/bullmq.js';
import { bindCookieManager } from '../lib/cookies.js';
import { CookieManager } from '../lib/cookie.manager.js';
import { BACKUP_QUEUE_NAME, enqueueBackupPayload } from '../workers/backup.worker.js';
import type { MetricsRecorder } from '../observability/metrics.js';
import { PREVIEW_QUEUE_NAME, PreviewService } from '../modules/previews/preview.service.js';
import { enqueuePreviewPayload } from '../workers/preview.worker.js';
import {
  createFolderAccessService,
  type FolderAccessService,
} from '../modules/storage/services/folder-access.service.js';
import {
  createFolderOperationService,
  type FolderOperationService,
} from '../modules/storage/services/folder-operation.service.js';
import {
  enqueueFolderOperation,
  FOLDER_OPERATION_QUEUE,
} from '../workers/folder-operation.worker.js';

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
  infrastructure: InfrastructureService;
  s3Credentials: S3CredentialService;
  previews: PreviewService;
  folderOperations: FolderOperationService;
  folderAccess: FolderAccessService;
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
  readonly infrastructure: InfrastructureService;
  readonly s3Credentials: S3CredentialService;
  readonly previews: PreviewService;
  readonly folderOperations: FolderOperationService;
  readonly folderAccess: FolderAccessService;

  constructor(
    private readonly prisma: PrismaClient,
    config: EnvConfig,
    private readonly logger: Logger,
    metrics?: MetricsRecorder,
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
    this.auth = new AuthService(prisma, this.sessions, config.NODE_ENV, config.JWT_SECRET);
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
      metrics,
    });
    const previewQueue =
      config.NODE_ENV === 'test'
        ? null
        : new Queue(PREVIEW_QUEUE_NAME, {
            connection: new Redis(config.REDIS_URL, {
              maxRetriesPerRequest: null,
              lazyConnect: true,
            }),
          });
    this.previews = new PreviewService(
      prisma,
      this.storage.objects,
      async (payload) => {
        if (config.NODE_ENV === 'test') {
          await this.previews.process(payload.jobId);
          return;
        }
        if (previewQueue) {
          await enqueuePreviewPayload(previewQueue, payload);
        }
      },
      logger,
    );
    const folderOperationQueue =
      config.NODE_ENV === 'test'
        ? null
        : new Queue(FOLDER_OPERATION_QUEUE, {
            connection: new Redis(config.REDIS_URL, {
              maxRetriesPerRequest: null,
              lazyConnect: true,
            }),
          });
    this.folderOperations = createFolderOperationService({
      prisma,
      objects: this.storage.objects,
      storage: this.storage.storage,
      queue: {
        enqueue: async (jobId) => {
          if (folderOperationQueue) {
            await enqueueFolderOperation(folderOperationQueue, jobId);
          }
        },
      },
      logger,
    });
    this.folderAccess = createFolderAccessService({
      prisma,
      storage: this.storage.storage,
      logger,
    });
    this.artifacts = new ArtifactsService(prisma, this.storage);
    this.backups = this.createBackupsService(prisma, config, logger);
    this.infrastructure = InfrastructureService.create(prisma, this.storage, config, logger);
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
    infrastructure: container.infrastructure,
    s3Credentials: container.s3Credentials,
    previews: container.previews,
    folderOperations: container.folderOperations,
    folderAccess: container.folderAccess,
  };
}

export function createAppContainer(
  prisma: PrismaClient,
  config: EnvConfig,
  logger: Logger,
  metrics?: MetricsRecorder,
): AppContainer {
  return new AppContainer(prisma, config, logger, metrics);
}
