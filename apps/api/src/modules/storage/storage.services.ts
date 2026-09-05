import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { Request } from 'express';
import type { AuthorizationService } from '../auth/authorization.service.js';
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

export interface StorageServices {
  authorization: AuthorizationService;
  storage: StorageService;
  buckets: BucketService;
  objects: ObjectService;
  uploads: UploadService;
  tokens: StorageTokenService;
  metrics: StorageMetrics;
  /** Absolute base URL used when minting VaultStack-signed storage URLs. */
  baseUrl(req: Request): string;
}

export function createStorageServices(deps: {
  prisma: PrismaClient;
  config: EnvConfig;
  logger: Logger;
  authorization: AuthorizationService;
}): StorageServices {
  const { prisma, config, logger, authorization } = deps;

  const registry = createProviderRegistry(config);
  const buckets = createBucketRepository(prisma);
  const objects = createObjectRepository(prisma);
  const uploads = createUploadRepository(prisma);
  const providers = createProviderRepository(prisma);

  const storage = createStorageService({ config, registry, buckets, providers });

  // Storage URLs are signed with the server JWT secret. It never leaves the
  // server and is not the same value as any storage provider credential.
  const tokens = createStorageTokenService(config.JWT_SECRET);
  const metrics = createStorageMetrics(logger);

  const objectService = createObjectService({
    prisma,
    objects,
    storage,
    tokens,
    metrics,
    logger,
  });

  return {
    authorization,
    storage,
    tokens,
    metrics,
    buckets: createBucketService({ prisma, buckets, storage }),
    objects: objectService,
    uploads: createUploadService({
      prisma,
      uploads,
      objects,
      storage,
      tokens,
      metrics,
      logger,
    }),

    baseUrl(req) {
      // `trust proxy` is enabled on the app, so protocol and host already
      // reflect the forwarded values when running behind a reverse proxy.
      return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
    },
  };
}
