import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { Request } from 'express';
import type { AuthorizationService } from '../auth/services/authorization.service.js';
import type { MetricsRecorder } from '../../observability/metrics.js';
import { createProviderRegistry } from './providers/provider-registry.js';
import { createBucketRepository } from './repositories/bucket.repository.js';
import { createObjectRepository } from './repositories/object.repository.js';
import { createProviderRepository } from './repositories/provider.repository.js';
import { createUploadRepository } from './repositories/upload.repository.js';
import { createBucketService, type BucketService } from './services/bucket.service.js';
import { createObjectService, type ObjectService } from './services/object.service.js';
import {
  createStorageTokenService,
  type StorageTokenService,
} from './services/storage-token.service.js';
import { createStorageMetrics, type StorageMetrics } from './services/storage.metrics.js';
import { createStorageService, type StorageService } from './services/storage.service.js';
import { createUploadService, type UploadService } from './services/upload.service.js';
import { createPolicyRepository } from './repositories/policy.repository.js';
import { createPolicyService, type PolicyService } from './services/policy.service.js';
import {
  createProviderConfigService,
  type ProviderConfigService,
} from './services/provider-config.service.js';
import { createShareService, type ShareService } from './services/share.service.js';
import {
  createFolderAuthorizationService,
  type FolderAuthorizationService,
} from './services/folder-authorization.service.js';

export interface StorageModuleDeps {
  prisma: PrismaClient;
  config: EnvConfig;
  logger: Logger;
  authorization: AuthorizationService;
  metrics?: MetricsRecorder;
}

/** Composition root for the storage module. */
export class StorageModule {
  readonly authorization: AuthorizationService;
  readonly storage: StorageService;
  readonly buckets: BucketService;
  readonly objects: ObjectService;
  readonly uploads: UploadService;
  readonly policies: PolicyService;
  readonly shares: ShareService;
  readonly providers: ProviderConfigService;
  readonly tokens: StorageTokenService;
  readonly metrics: StorageMetrics;
  readonly folderAuthorization: FolderAuthorizationService;

  constructor(deps: StorageModuleDeps) {
    const { prisma, config, logger, authorization } = deps;
    this.authorization = authorization;

    const registry = createProviderRegistry(config);
    const buckets = createBucketRepository(prisma);
    const objects = createObjectRepository(prisma);
    const uploads = createUploadRepository(prisma);
    const providers = createProviderRepository(prisma);

    this.storage = createStorageService({ config, registry, buckets, providers });
    this.tokens = createStorageTokenService(config.JWT_SECRET);
    this.metrics = createStorageMetrics(logger, deps.metrics);
    this.folderAuthorization = createFolderAuthorizationService(prisma);

    this.objects = createObjectService({
      prisma,
      objects,
      storage: this.storage,
      tokens: this.tokens,
      metrics: this.metrics,
      logger,
      folderAuthorization: this.folderAuthorization,
    });

    this.buckets = createBucketService({ prisma, buckets, storage: this.storage });
    this.uploads = createUploadService({
      prisma,
      uploads,
      objects,
      storage: this.storage,
      tokens: this.tokens,
      metrics: this.metrics,
      logger,
      folderAuthorization: this.folderAuthorization,
    });

    this.policies = createPolicyService({
      prisma,
      policies: createPolicyRepository(prisma),
      storage: this.storage,
      objects: this.objects,
      uploads: this.uploads,
      logger,
    });

    this.shares = createShareService(
      prisma,
      this.tokens,
      config.NODE_ENV,
      this.folderAuthorization,
    );
    this.providers = createProviderConfigService({
      prisma,
      config,
      providers,
      registry,
    });
  }

  /** Absolute base URL used when minting VaultStack-signed storage URLs. */
  baseUrl(req: Request): string {
    return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  }
}

export type StorageServices = StorageModule;

export function createStorageServices(deps: StorageModuleDeps): StorageModule {
  return new StorageModule(deps);
}
