import type { EnvConfig } from '@vaultstack/config';
import type { Prisma } from '@vaultstack/database';
import { STORAGE_PROVIDER_TYPES } from '@vaultstack/types';
import {
  resolveS3Connection,
  type S3ConnectionConfig,
} from '../../../integrations/minio/minio.config.js';
import { storageProviderUnavailable } from '../../../lib/errors.js';
import { readProviderConfig } from '../domain/provider-config.js';
import type { StorageProvider } from '../domain/storage-provider.js';
import { getS3Dialect, resolveDialectEndpoint } from './s3-compatible/dialects.js';
import { createS3CompatibleProviderFromConnection } from './s3-compatible/factory.js';
import {
  decryptProviderSecret,
  deriveStorageProviderEncryptionKey,
} from './s3-compatible/provider-crypto.js';
import { createLocalFilesystemProvider } from './local-filesystem/local-filesystem.provider.js';

/** The persisted provider row, narrowed to what construction needs. */
export interface StorageProviderRecord {
  id: string;
  type: string;
  credentialRef: string | null;
  config: Prisma.JsonValue;
  accessKeyId: string | null;
  secretCiphertext: string | null;
  secretNonce: string | null;
}

/**
 * Builds and caches `StorageProvider` instances.
 *
 * This factory is the only place in the codebase permitted to branch on
 * provider type. Everything downstream depends on the `StorageProvider`
 * interface, which is what keeps `if (provider === 'minio')` out of services.
 * Vendor dialects are resolved inside the S3-compatible adapter layer.
 */
export interface ProviderRegistry {
  resolve(record: StorageProviderRecord): StorageProvider;
  invalidate(providerId: string): void;
  /** Provider used when an organization has no explicit provider configured. */
  defaultType(): string;
}

export function createProviderRegistry(config: EnvConfig): ProviderRegistry {
  const cache = new Map<string, StorageProvider>();
  const encryptionKey = deriveStorageProviderEncryptionKey(config.JWT_SECRET);

  return {
    resolve(record) {
      const cached = cache.get(record.id);
      if (cached) {
        return cached;
      }

      const provider = build(record, config, encryptionKey);
      cache.set(record.id, provider);
      return provider;
    },

    invalidate(providerId) {
      cache.delete(providerId);
    },

    defaultType() {
      return config.STORAGE_DRIVER === 's3'
        ? STORAGE_PROVIDER_TYPES.S3_COMPATIBLE
        : STORAGE_PROVIDER_TYPES.LOCAL_FILESYSTEM;
    },
  };
}

function build(
  record: StorageProviderRecord,
  config: EnvConfig,
  encryptionKey: Buffer,
): StorageProvider {
  if (record.type === STORAGE_PROVIDER_TYPES.LOCAL_FILESYSTEM) {
    return createLocalFilesystemProvider({ root: config.STORAGE_LOCAL_ROOT });
  }

  if (record.type === STORAGE_PROVIDER_TYPES.S3_COMPATIBLE) {
    return buildS3Provider(record, config, encryptionKey);
  }

  throw storageProviderUnavailable(`Unsupported storage provider type: ${record.type}`);
}

function buildS3Provider(
  record: StorageProviderRecord,
  config: EnvConfig,
  encryptionKey: Buffer,
): StorageProvider {
  if (record.credentialRef === 'env:S3') {
    const connection = resolveS3Connection(config);
    if (!connection) {
      throw storageProviderUnavailable('S3-compatible storage is not configured on this server');
    }

    return createS3CompatibleProviderFromConnection({ connection, ownsPhysicalBuckets: true });
  }

  return createS3CompatibleProviderFromConnection(resolveStoredS3Connection(record, encryptionKey));
}

export function resolveStoredS3Connection(
  record: StorageProviderRecord,
  encryptionKey: Buffer,
): {
  connection: S3ConnectionConfig;
  dialect: ReturnType<typeof getS3Dialect>;
  ownsPhysicalBuckets: boolean;
} {
  const settings = readProviderConfig(record.config);
  if (!settings.dialect) {
    throw storageProviderUnavailable('S3-compatible provider is missing a dialect');
  }

  if (!record.accessKeyId || !record.secretCiphertext || !record.secretNonce) {
    throw storageProviderUnavailable('S3-compatible provider is missing credentials');
  }

  let secretAccessKey: string;
  try {
    secretAccessKey = decryptProviderSecret(
      record.secretCiphertext,
      record.secretNonce,
      encryptionKey,
    );
  } catch {
    throw storageProviderUnavailable('S3-compatible provider credentials could not be decrypted');
  }

  const dialect = getS3DialectSafe(settings.dialect);
  const tls = settings.tls ?? dialect.defaultTls;
  let endpoint: string | undefined;
  try {
    endpoint = resolveDialectEndpoint(dialect, {
      endpoint: settings.endpoint,
      region: settings.region,
      tls,
      accountId: settings.accountId,
    });
  } catch {
    throw storageProviderUnavailable('S3-compatible provider endpoint is invalid');
  }

  return {
    connection: {
      endpoint,
      region: settings.region ?? dialect.defaultRegion,
      accessKeyId: record.accessKeyId,
      secretAccessKey,
      forcePathStyle: settings.forcePathStyle ?? dialect.defaultForcePathStyle,
    },
    dialect,
    ownsPhysicalBuckets: !settings.bucket,
  };
}

function getS3DialectSafe(name: string) {
  try {
    return getS3Dialect(name);
  } catch {
    throw storageProviderUnavailable('S3-compatible provider dialect is invalid');
  }
}
