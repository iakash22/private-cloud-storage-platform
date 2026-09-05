import type { EnvConfig } from '@vaultstack/config';
import { STORAGE_PROVIDER_TYPES } from '@vaultstack/types';
import { createS3Client } from '../../../integrations/minio/minio.client.js';
import { resolveS3Connection } from '../../../integrations/minio/minio.config.js';
import { storageProviderUnavailable } from '../../../lib/errors.js';
import type { StorageProvider } from '../domain/storage-provider.js';
import { createLocalFilesystemProvider } from './local-filesystem/local-filesystem.provider.js';
import { createS3CompatibleProvider } from './s3-compatible/s3-compatible.provider.js';

/** The persisted provider row, narrowed to what construction needs. */
export interface StorageProviderRecord {
  id: string;
  type: string;
  credentialRef: string | null;
}

/**
 * Builds and caches `StorageProvider` instances.
 *
 * This factory is the only place in the codebase permitted to branch on
 * provider type. Everything downstream depends on the `StorageProvider`
 * interface, which is what keeps `if (provider === 'minio')` out of services.
 */
export interface ProviderRegistry {
  resolve(record: StorageProviderRecord): StorageProvider;
  /** Provider used when an organization has no explicit provider configured. */
  defaultType(): string;
}

export function createProviderRegistry(config: EnvConfig): ProviderRegistry {
  const cache = new Map<string, StorageProvider>();

  return {
    resolve(record) {
      const cached = cache.get(record.id);
      if (cached) {
        return cached;
      }

      const provider = build(record, config);
      cache.set(record.id, provider);
      return provider;
    },

    defaultType() {
      return config.STORAGE_DRIVER === 's3'
        ? STORAGE_PROVIDER_TYPES.S3_COMPATIBLE
        : STORAGE_PROVIDER_TYPES.LOCAL_FILESYSTEM;
    },
  };
}

function build(record: StorageProviderRecord, config: EnvConfig): StorageProvider {
  if (record.type === STORAGE_PROVIDER_TYPES.LOCAL_FILESYSTEM) {
    return createLocalFilesystemProvider({ root: config.STORAGE_LOCAL_ROOT });
  }

  if (record.type === STORAGE_PROVIDER_TYPES.S3_COMPATIBLE) {
    const connection = resolveS3Connection(config);
    if (!connection) {
      throw storageProviderUnavailable('S3-compatible storage is not configured on this server');
    }

    return createS3CompatibleProvider({
      client: createS3Client(connection),
      region: connection.region,
    });
  }

  throw storageProviderUnavailable(`Unsupported storage provider type: ${record.type}`);
}
