import {
  StorageProviderStatus,
  StorageProviderType,
  type PrismaClient,
  type StorageProvider as StorageProviderRow,
} from '@vaultstack/database';
import type { EnvConfig } from '@vaultstack/config';
import type {
  PublicStorageProvider,
  PublicStorageProviderHealth,
  S3DialectName,
} from '@vaultstack/types';
import type { CreateStorageProviderBody, UpdateStorageProviderBody } from '@vaultstack/validation';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, storageProviderNotFound, validationError } from '../../../lib/errors.js';
import {
  readProviderConfig,
  toProviderConfigJson,
  type StorageProviderSettings,
} from '../domain/provider-config.js';
import { serializeStorageProvider } from '../mappers/storage.mapper.js';
import { getS3Dialect, resolveDialectEndpoint } from '../providers/s3-compatible/dialects.js';
import {
  assertSafeS3Endpoint,
  restrictPrivateEndpointPolicy,
} from '../providers/s3-compatible/endpoint-safety.js';
import {
  deriveStorageProviderEncryptionKey,
  encryptProviderSecret,
} from '../providers/s3-compatible/provider-crypto.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { ProviderRepository } from '../repositories/provider.repository.js';
import type { RequestMeta } from './bucket.service.js';

export interface ProviderConfigService {
  list(organizationId: string): Promise<PublicStorageProvider[]>;
  get(organizationId: string, providerId: string): Promise<PublicStorageProvider>;
  create(
    organizationId: string,
    userId: string,
    input: CreateStorageProviderBody,
    meta: RequestMeta,
  ): Promise<PublicStorageProvider>;
  update(
    organizationId: string,
    providerId: string,
    userId: string,
    input: UpdateStorageProviderBody,
    meta: RequestMeta,
  ): Promise<PublicStorageProvider>;
  remove(
    organizationId: string,
    providerId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void>;
  testConnection(
    organizationId: string,
    providerId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicStorageProviderHealth>;
}

export function createProviderConfigService(deps: {
  prisma: PrismaClient;
  config: EnvConfig;
  providers: ProviderRepository;
  registry: ProviderRegistry;
}): ProviderConfigService {
  const { prisma, config, providers, registry } = deps;
  const encryptionKey = deriveStorageProviderEncryptionKey(config.JWT_SECRET);

  return {
    async list(organizationId) {
      const rows = await providers.listByOrganization(organizationId);
      return rows.map(serializeStorageProvider);
    },

    async get(organizationId, providerId) {
      const row = await requireProvider(providers, organizationId, providerId);
      return serializeStorageProvider(row);
    },

    async create(organizationId, userId, input, meta) {
      const settings = await validateAndResolveSettings({
        dialect: input.dialect,
        endpoint: input.endpoint,
        region: input.region,
        bucket: input.bucket,
        forcePathStyle: input.forcePathStyle,
        tls: input.tls,
        accountId: input.accountId,
        allowPrivateEndpoints: config.S3_ALLOW_PRIVATE_ENDPOINTS,
      });

      const encrypted = encryptProviderSecret(input.secretAccessKey, encryptionKey);

      let row: StorageProviderRow;
      try {
        row = await providers.create({
          organizationId,
          name: input.name,
          type: StorageProviderType.S3_COMPATIBLE,
          status: input.status ? StorageProviderStatus[input.status] : StorageProviderStatus.ACTIVE,
          isDefault: input.isDefault ?? false,
          config: toProviderConfigJson(settings),
          credentialRef: null,
          accessKeyId: input.accessKeyId,
          secretCiphertext: encrypted.ciphertext,
          secretNonce: encrypted.nonce,
        });
      } catch (error) {
        throw normalizeUniqueViolation(error);
      }

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.provider.created',
        resourceType: 'storage_provider',
        resourceId: row.id,
        metadata: {
          name: row.name,
          dialect: settings.dialect,
          endpoint: settings.endpoint,
          isDefault: row.isDefault,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeStorageProvider(row);
    },

    async update(organizationId, providerId, userId, input, meta) {
      const existing = await requireProvider(providers, organizationId, providerId);

      if (existing.type !== StorageProviderType.S3_COMPATIBLE) {
        if (
          input.dialect ||
          input.endpoint !== undefined ||
          input.secretAccessKey ||
          input.accessKeyId ||
          input.bucket !== undefined ||
          input.accountId !== undefined
        ) {
          throw validationError('Local filesystem providers do not accept S3 connection settings', {
            dialect: 'Local filesystem providers do not accept S3 connection settings',
          });
        }
      }

      const current = readProviderConfig(existing.config);
      const nextSettings =
        existing.type === StorageProviderType.S3_COMPATIBLE
          ? await validateAndResolveSettings({
              dialect: input.dialect ?? current.dialect ?? undefined,
              endpoint: mergeNullable(input.endpoint, current.endpoint),
              region: mergeNullable(input.region, current.region),
              bucket: mergeNullable(input.bucket, current.bucket),
              forcePathStyle: mergeNullable(input.forcePathStyle, current.forcePathStyle),
              tls: mergeNullable(input.tls, current.tls),
              accountId: mergeNullable(input.accountId, current.accountId),
              allowPrivateEndpoints: config.S3_ALLOW_PRIVATE_ENDPOINTS,
            })
          : current;

      let secretCiphertext = existing.secretCiphertext;
      let secretNonce = existing.secretNonce;
      if (input.secretAccessKey) {
        if (existing.type !== StorageProviderType.S3_COMPATIBLE) {
          throw validationError('Local filesystem providers do not accept S3 connection settings', {
            secretAccessKey: 'Local filesystem providers do not accept S3 connection settings',
          });
        }
        const encrypted = encryptProviderSecret(input.secretAccessKey, encryptionKey);
        secretCiphertext = encrypted.ciphertext;
        secretNonce = encrypted.nonce;
      }

      const updated = await providers.update(organizationId, providerId, {
        name: input.name,
        status: input.status ? StorageProviderStatus[input.status] : undefined,
        isDefault: input.isDefault,
        config:
          existing.type === StorageProviderType.S3_COMPATIBLE
            ? toProviderConfigJson(nextSettings)
            : undefined,
        accessKeyId: input.accessKeyId,
        secretCiphertext,
        secretNonce,
        credentialRef: input.secretAccessKey ? null : undefined,
      });

      if (!updated) {
        throw storageProviderNotFound();
      }

      registry.invalidate(providerId);

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.provider.updated',
        resourceType: 'storage_provider',
        resourceId: providerId,
        metadata: {
          name: updated.name,
          dialect: nextSettings.dialect,
          isDefault: updated.isDefault,
          secretRotated: Boolean(input.secretAccessKey),
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeStorageProvider(updated);
    },

    async remove(organizationId, providerId, userId, meta) {
      const existing = await requireProvider(providers, organizationId, providerId);
      const bucketCount = await providers.countBuckets(organizationId, providerId);
      if (bucketCount > 0) {
        throw conflict('Storage provider still has buckets');
      }

      await providers.delete(organizationId, providerId);
      registry.invalidate(providerId);

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.provider.deleted',
        resourceType: 'storage_provider',
        resourceId: providerId,
        metadata: { name: existing.name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },

    async testConnection(organizationId, providerId, userId, meta) {
      const existing = await requireProvider(providers, organizationId, providerId);
      const provider = registry.resolve(existing);
      const health = await provider.healthCheck();
      const publicHealth: PublicStorageProviderHealth = {
        ok: health.ok,
        message: health.ok ? 'Connection succeeded' : 'Endpoint could not be reached',
      };

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.provider.tested',
        resourceType: 'storage_provider',
        resourceId: providerId,
        metadata: { ok: publicHealth.ok },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return publicHealth;
    },
  };
}

async function validateAndResolveSettings(input: {
  dialect?: S3DialectName | null;
  endpoint?: string | null;
  region?: string | null;
  bucket?: string | null;
  forcePathStyle?: boolean | null;
  tls?: boolean | null;
  accountId?: string | null;
  allowPrivateEndpoints: boolean;
}): Promise<StorageProviderSettings> {
  if (!input.dialect) {
    throw validationError('S3 dialect is required', { dialect: 'S3 dialect is required' });
  }

  const dialect = getS3Dialect(input.dialect);
  const tls = input.tls ?? dialect.defaultTls;
  const endpoint = resolveDialectEndpoint(dialect, {
    endpoint: input.endpoint,
    region: input.region,
    tls,
    accountId: input.accountId,
  });

  if (endpoint) {
    await assertSafeS3Endpoint(
      endpoint,
      input.allowPrivateEndpoints
        ? dialect.endpointPolicy
        : restrictPrivateEndpointPolicy(dialect.endpointPolicy),
    );
    const parsed = new URL(endpoint);
    if (tls && parsed.protocol !== 'https:') {
      throw validationError('Storage endpoint must use HTTPS', {
        endpoint: 'Storage endpoint must use HTTPS',
      });
    }
  }

  return {
    dialect: input.dialect,
    endpoint: nonempty(input.endpoint),
    region: nonempty(input.region) ?? dialect.defaultRegion,
    bucket: nonempty(input.bucket),
    forcePathStyle: input.forcePathStyle ?? dialect.defaultForcePathStyle,
    tls,
    accountId: nonempty(input.accountId),
  };
}

function nonempty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') {
    return null;
  }

  return trimmed;
}

function mergeNullable<T>(patch: T | null | undefined, current: T | null): T | null | undefined {
  if (patch === undefined) {
    return current ?? undefined;
  }

  return patch;
}

async function requireProvider(
  providers: ProviderRepository,
  organizationId: string,
  providerId: string,
): Promise<StorageProviderRow> {
  const row = await providers.findById(organizationId, providerId);
  if (!row) {
    throw storageProviderNotFound();
  }

  return row;
}

function normalizeUniqueViolation(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2002') {
    return conflict('A storage provider with that name already exists', {
      name: 'A storage provider with that name already exists',
    });
  }
  return error;
}
