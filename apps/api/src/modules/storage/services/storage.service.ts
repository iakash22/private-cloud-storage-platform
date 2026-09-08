import { randomUUID } from 'node:crypto';
import type { EnvConfig } from '@vaultstack/config';
import {
  StorageProviderStatus,
  StorageProviderType,
  type Bucket,
  type StorageProvider as StorageProviderRow,
} from '@vaultstack/database';
import {
  storageBucketNotFound,
  storageProviderNotFound,
  storageProviderUnavailable,
} from '../../../lib/errors.js';
import type { StorageProvider } from '../domain/storage-provider.js';
import type { StorageLocation } from '../domain/storage.types.js';
import type { ProviderRegistry } from '../providers/provider-registry.js';
import type { BucketRepository } from '../repositories/bucket.repository.js';
import type { ProviderRepository } from '../repositories/provider.repository.js';

/** Centralized limits, sourced from configuration rather than constants. */
export interface StorageLimits {
  maxObjectSizeBytes: number;
  maxRequestSizeBytes: number;
  multipartMinPartSizeBytes: number;
  multipartMaxParts: number;
  maxMetadataBytes: number;
  maxKeyLength: number;
  presignedUrlTtlSeconds: number;
  uploadTtlSeconds: number;
}

export interface ResolvedBucket {
  bucket: Bucket;
  providerRecord: StorageProviderRow;
  provider: StorageProvider;
}

export interface StorageService {
  readonly limits: StorageLimits;

  /**
   * Loads a bucket and its provider within an organization.
   *
   * Resolution always starts from (organizationId, bucketId), which is what
   * makes a bucket id an authorization boundary rather than a lookup key.
   */
  resolveBucket(organizationId: string, bucketId: string): Promise<ResolvedBucket>;
  defaultProvider(organizationId: string): Promise<StorageProviderRow>;
  findProvider(organizationId: string, providerId: string): Promise<StorageProviderRow>;
  providerFor(record: StorageProviderRow): StorageProvider;

  physicalBucketFor(bucket: Pick<Bucket, 'id' | 'physicalPrefix'>): string;
  physicalKeyFor(input: { organizationId: string; objectId: string; versionId: string }): string;
  newObjectId(): string;
  newVersionId(): string;
  locationFor(bucket: Pick<Bucket, 'id' | 'physicalPrefix'>, physicalKey: string): StorageLocation;
}

export function createStorageService(deps: {
  config: EnvConfig;
  registry: ProviderRegistry;
  buckets: BucketRepository;
  providers: ProviderRepository;
}): StorageService {
  const { config, registry, buckets, providers } = deps;

  const limits: StorageLimits = {
    maxObjectSizeBytes: config.STORAGE_MAX_OBJECT_SIZE_BYTES,
    maxRequestSizeBytes: config.STORAGE_MAX_REQUEST_SIZE_BYTES,
    multipartMinPartSizeBytes: config.STORAGE_MULTIPART_MIN_PART_SIZE_BYTES,
    multipartMaxParts: config.STORAGE_MULTIPART_MAX_PARTS,
    maxMetadataBytes: config.STORAGE_MAX_METADATA_BYTES,
    maxKeyLength: config.STORAGE_MAX_KEY_LENGTH,
    presignedUrlTtlSeconds: config.STORAGE_PRESIGNED_URL_TTL_SECONDS,
    uploadTtlSeconds: config.STORAGE_UPLOAD_TTL_SECONDS,
  };

  const service: StorageService = {
    limits,

    async resolveBucket(organizationId, bucketId) {
      const bucket = await buckets.findById(organizationId, bucketId);
      if (!bucket) {
        throw storageBucketNotFound();
      }

      const providerRecord = await providers.findById(organizationId, bucket.storageProviderId);
      if (!providerRecord) {
        throw storageProviderUnavailable('Bucket provider is no longer registered');
      }

      if (providerRecord.status === StorageProviderStatus.DISABLED) {
        throw storageProviderUnavailable('Storage provider is disabled');
      }

      return {
        bucket,
        providerRecord,
        provider: registry.resolve(providerRecord),
      };
    },

    async defaultProvider(organizationId) {
      const configured = registry.defaultType();
      const type =
        configured === StorageProviderType.S3_COMPATIBLE
          ? StorageProviderType.S3_COMPATIBLE
          : StorageProviderType.LOCAL_FILESYSTEM;

      return providers.ensureDefault(organizationId, type);
    },

    async findProvider(organizationId, providerId) {
      const record = await providers.findById(organizationId, providerId);
      if (!record) {
        throw storageProviderNotFound();
      }

      if (record.status === StorageProviderStatus.DISABLED) {
        throw storageProviderUnavailable('Storage provider is disabled');
      }

      return record;
    },

    providerFor(record) {
      return registry.resolve(record);
    },

    /**
     * Physical bucket identifier.
     *
     * Uses the stored physical prefix when present so objects land in the
     * namespace provisioned at bucket creation (including a shared external
     * bucket). Otherwise derived from the bucket id so it is stable,
     * unguessable, free of user input, and simultaneously a valid S3 bucket
     * name and a valid directory name.
     */
    physicalBucketFor(bucket) {
      if (bucket.physicalPrefix.length > 0) {
        return bucket.physicalPrefix;
      }

      return `vs-${bucket.id.toLowerCase()}`;
    },

    /**
     * Physical object location, server-generated end to end.
     *
     * The version segment gives every write its own location, so a new version
     * never overwrites bytes that a reader may still be streaming.
     */
    physicalKeyFor({ organizationId, objectId, versionId }) {
      const fanout = objectId.slice(0, 2);
      return `${organizationId}/${fanout}/${objectId}/${versionId}`;
    },

    newObjectId() {
      return randomUUID();
    },

    newVersionId() {
      return randomUUID();
    },

    locationFor(bucket, physicalKey) {
      return {
        physicalBucket: service.physicalBucketFor(bucket),
        physicalKey,
      };
    },
  };

  return service;
}
