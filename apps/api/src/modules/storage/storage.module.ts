import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { Request } from 'express';
import type { AuthorizationService } from '../auth/services/authorization.service.js';
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

export interface StorageModuleDeps {
  prisma: PrismaClient;
  config: EnvConfig;
  logger: Logger;
  authorization: AuthorizationService;
}

/** Composition root for the storage module. */
export class StorageModule {
  readonly authorization: AuthorizationService;
  readonly storage: StorageService;
  readonly buckets: BucketService;
  readonly objects: ObjectService;
  readonly uploads: UploadService;
  readonly tokens: StorageTokenService;
  readonly metrics: StorageMetrics;

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
    this.metrics = createStorageMetrics(logger);

    this.objects = createObjectService({
      prisma,
      objects,
      storage: this.storage,
      tokens: this.tokens,
      metrics: this.metrics,
      logger,
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
