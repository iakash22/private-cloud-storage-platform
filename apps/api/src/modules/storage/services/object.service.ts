import type { Readable } from 'node:stream';
import { ChecksumAlgorithm, type PrismaClient, type StorageObject } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type {
  PublicObjectListPage,
  PublicObjectVersion,
  PublicObjectVersionListPage,
  PublicPresignedUrl,
  PublicStorageObject,
} from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import {
  storageChecksumMismatch,
  storageObjectNotFound,
  storageObjectTooLarge,
  storageSizeMismatch,
  validationError,
} from '../../../lib/errors.js';
import { serializeObjectVersion, serializeStorageObject } from '../mappers/storage.mapper.js';
import { ObjectTooLargeError } from '../domain/integrity.js';
import { assertValidKeyPrefix, assertValidObjectKey } from '../domain/object-key.js';
import type { GetObjectResult } from '../domain/storage.types.js';
import { usesDeleteMarkers } from '../domain/versioning.js';
import type { ObjectRepository } from '../repositories/object.repository.js';
import type { RequestMeta } from './bucket.service.js';
import { publishObjectVersion } from './publish-object.js';
import { deleteVersionBytes, reclaimSupersededVersions } from './reclaim-versions.js';
import type { StorageMetrics } from './storage.metrics.js';
import type { StorageService } from './storage.service.js';
import type { StorageTokenService } from './storage-token.service.js';

export interface PutObjectOptions {
  organizationId: string;
  bucketId: string;
  key: string;
  body: Readable;
  contentType?: string;
  metadata?: Record<string, string>;
  expectedSize?: number;
  expectedChecksumSha256?: string;
  signal?: AbortSignal;
  userId: string | null;
}

export interface ListOptions {
  prefix?: string;
  delimiter?: string;
  limit: number;
  cursor?: string;
}

export interface ObjectService {
  list(
    organizationId: string,
    bucketId: string,
    options: ListOptions,
  ): Promise<PublicObjectListPage>;
  get(organizationId: string, objectId: string): Promise<PublicStorageObject>;
  findByKey(organizationId: string, bucketId: string, key: string): Promise<PublicStorageObject>;
  put(options: PutObjectOptions): Promise<PublicStorageObject>;
  openDownload(
    organizationId: string,
    objectId: string,
    options?: {
      range?: { start: number; end?: number };
      signal?: AbortSignal;
      versionId?: string;
    },
  ): Promise<{ object: StorageObject; stream: GetObjectResult }>;
  createDownloadUrl(
    organizationId: string,
    objectId: string,
    baseUrl: string,
    versionId?: string,
  ): Promise<PublicPresignedUrl>;
  remove(
    organizationId: string,
    objectId: string,
    userId: string,
    meta: RequestMeta,
    versionId?: string,
  ): Promise<void>;
  listVersions(organizationId: string, objectId: string): Promise<PublicObjectVersionListPage>;
  getVersion(
    organizationId: string,
    objectId: string,
    versionId: string,
  ): Promise<PublicObjectVersion>;
  restoreVersion(
    organizationId: string,
    objectId: string,
    versionId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicStorageObject>;
  copy(input: {
    organizationId: string;
    objectId: string;
    destinationBucketId: string;
    destinationKey: string;
    userId: string;
    meta: RequestMeta;
  }): Promise<PublicStorageObject>;
  move(input: {
    organizationId: string;
    objectId: string;
    destinationBucketId: string;
    destinationKey: string;
    userId: string;
    meta: RequestMeta;
  }): Promise<PublicStorageObject>;
}

export function createObjectService(deps: {
  prisma: PrismaClient;
  objects: ObjectRepository;
  storage: StorageService;
  tokens: StorageTokenService;
  metrics: StorageMetrics;
  logger: Logger;
}): ObjectService {
  const { prisma, objects, storage, tokens, metrics, logger } = deps;
  const limits = storage.limits;

  /** Loads an object and its bucket together, always inside one organization. */
  async function requireObject(organizationId: string, objectId: string) {
    const object = await objects.findById(organizationId, objectId);
    if (!object) {
      throw storageObjectNotFound();
    }

    const resolved = await storage.resolveBucket(organizationId, object.bucketId);
    return { object, ...resolved };
  }

  async function requireLiveObject(organizationId: string, objectId: string) {
    const found = await requireObject(organizationId, objectId);
    if (found.object.isDeleted) {
      throw storageObjectNotFound();
    }
    return found;
  }

  async function requireVersion(organizationId: string, objectId: string, versionId: string) {
    const found = await requireObject(organizationId, objectId);
    const version = await objects.findVersion(organizationId, objectId, versionId);
    if (!version) {
      throw storageObjectNotFound();
    }
    return { ...found, version };
  }

  async function deletePermanentVersion(
    organizationId: string,
    objectId: string,
    versionId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { object, bucket, provider, version } = await requireVersion(
      organizationId,
      objectId,
      versionId,
    );

    await prisma.objectVersion.deleteMany({
      where: { organizationId, objectId, versionId },
    });

    await deleteVersionBytes(
      {
        provider,
        locationFor: (key) => storage.locationFor(bucket, key),
        logger,
        objectId,
      },
      version,
    );

    const remaining = await objects.listVersions(organizationId, objectId);
    if (remaining.length === 0) {
      await objects.delete(organizationId, objectId);
    } else if (version.isCurrent) {
      const next = remaining[0];
      if (next) {
        await prisma.$transaction(async (tx) => {
          await tx.objectVersion.updateMany({
            where: { objectId, isCurrent: true },
            data: { isCurrent: false },
          });
          await tx.objectVersion.updateMany({
            where: { organizationId, objectId, versionId: next.versionId },
            data: { isCurrent: true },
          });
          await tx.storageObject.update({
            where: { id: objectId },
            data: {
              size: next.size,
              contentType: next.contentType,
              etag: next.etag,
              checksumAlgorithm: next.checksumAlgorithm,
              checksum: next.checksum,
              physicalKey: next.physicalKey,
              currentVersionId: next.versionId,
              isDeleted: next.isDeleteMarker,
              ...(next.metadata ? { metadata: next.metadata } : {}),
            },
          });
        });
      }
    }

    await writeAuditLog(prisma, {
      organizationId,
      userId,
      action: 'storage.object.version_deleted',
      resourceType: 'object',
      resourceId: objectId,
      metadata: { bucketId: object.bucketId, key: object.key, versionId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  const service: ObjectService = {
    async list(organizationId, bucketId, options) {
      // Validates the bucket belongs to this organization before listing.
      await storage.resolveBucket(organizationId, bucketId);

      const prefix = options.prefix
        ? assertValidKeyPrefix(options.prefix, limits.maxKeyLength)
        : undefined;

      const query = {
        organizationId,
        bucketId,
        prefix,
        delimiter: options.delimiter,
        limit: Math.min(options.limit, 1000),
        cursorKey: options.cursor,
      };

      const [page, prefixes] = await Promise.all([
        objects.list(query),
        options.delimiter ? objects.listPrefixes(query) : Promise.resolve([]),
      ]);

      return {
        objects: page.objects.map(serializeStorageObject),
        prefixes,
        nextCursor: page.nextCursor,
        isTruncated: page.isTruncated,
      };
    },

    async get(organizationId, objectId) {
      const { object } = await requireLiveObject(organizationId, objectId);
      return serializeStorageObject(object);
    },

    async findByKey(organizationId, bucketId, key) {
      const normalizedKey = assertValidObjectKey(key, limits.maxKeyLength);
      const object = await objects.findByKey(organizationId, bucketId, normalizedKey);
      if (!object || object.isDeleted) {
        throw storageObjectNotFound();
      }
      return serializeStorageObject(object);
    },

    async put(options) {
      const key = assertValidObjectKey(options.key, limits.maxKeyLength);
      assertMetadataSize(options.metadata, limits.maxMetadataBytes);

      if (options.expectedSize !== undefined && options.expectedSize > limits.maxObjectSizeBytes) {
        throw storageObjectTooLarge(limits.maxObjectSizeBytes);
      }

      const resolved = await storage.resolveBucket(options.organizationId, options.bucketId);
      const existing = await objects.findByKey(options.organizationId, options.bucketId, key);

      const objectId = existing?.id ?? storage.newObjectId();
      const versionId = storage.newVersionId();
      const physicalKey = storage.physicalKeyFor({
        organizationId: options.organizationId,
        objectId,
        versionId,
      });
      const location = storage.locationFor(resolved.bucket, physicalKey);

      const startedAt = Date.now();
      metrics.uploadStarted();

      let result;
      try {
        result = await resolved.provider.putObject({
          ...location,
          body: options.body,
          contentType: options.contentType,
          metadata: options.metadata,
          maxSizeBytes: limits.maxObjectSizeBytes,
          expect: {
            size: options.expectedSize,
            ...(options.expectedChecksumSha256
              ? {
                  checksum: { algorithm: 'SHA256' as const, value: options.expectedChecksumSha256 },
                }
              : {}),
          },
          signal: options.signal,
        });
      } catch (error) {
        metrics.uploadFailed({
          organizationId: options.organizationId,
          bucketId: options.bucketId,
          reason: error instanceof Error ? error.name : 'unknown',
        });

        if (error instanceof ObjectTooLargeError) {
          throw storageObjectTooLarge(error.maxSizeBytes);
        }
        throw error;
      }

      // Integrity is verified after the bytes land but before any metadata is
      // published, so a corrupted upload never becomes a readable object.
      const integrityFailure = checkIntegrity(options, result);
      if (integrityFailure) {
        await resolved.provider.deleteObject(location).catch(() => undefined);
        metrics.uploadFailed({
          organizationId: options.organizationId,
          bucketId: options.bucketId,
          reason: integrityFailure.name,
        });
        throw integrityFailure;
      }

      const record = {
        organizationId: options.organizationId,
        bucketId: options.bucketId,
        storageProviderId: resolved.providerRecord.id,
        key,
        size: BigInt(result.size),
        contentType: result.contentType,
        etag: result.etag,
        checksumAlgorithm:
          result.checksum.algorithm === 'SHA256'
            ? ChecksumAlgorithm.SHA256
            : ChecksumAlgorithm.NONE,
        checksum: result.checksum.value || null,
        physicalKey,
        ...(options.metadata ? { metadata: options.metadata } : {}),
      };

      let saved: StorageObject;

      try {
        // Filesystem writes cannot join a PostgreSQL transaction, so the
        // metadata mutations are grouped and the physical write is compensated
        // for if they fail.
        saved = await publishObjectVersion(prisma, {
          organizationId: options.organizationId,
          bucketId: options.bucketId,
          storageProviderId: resolved.providerRecord.id,
          objectId,
          existingId: existing?.id,
          key,
          versionId,
          physicalKey,
          size: record.size,
          contentType: record.contentType,
          etag: record.etag,
          checksum: record.checksum,
          metadata: options.metadata,
        });
      } catch (error) {
        await resolved.provider.deleteObject(location).catch(() => undefined);
        metrics.uploadFailed({
          organizationId: options.organizationId,
          bucketId: options.bucketId,
          reason: 'metadata_write_failed',
        });
        throw error;
      }

      // Unversioned buckets keep exactly one copy. Suspended buckets replace
      // only the current version and keep older history from when versioning
      // was enabled. Enabled buckets retain every version.
      await reclaimSupersededVersions({
        prisma,
        provider: resolved.provider,
        locationFor: (key) => storage.locationFor(resolved.bucket, key),
        organizationId: options.organizationId,
        objectId: saved.id,
        versioning: resolved.bucket.versioning,
        logger,
      });

      metrics.uploadCompleted({
        organizationId: options.organizationId,
        bucketId: options.bucketId,
        bytes: result.size,
        durationMs: Date.now() - startedAt,
      });

      await writeAuditLog(prisma, {
        organizationId: options.organizationId,
        userId: options.userId,
        action: 'storage.object.uploaded',
        resourceType: 'object',
        resourceId: saved.id,
        metadata: { bucketId: options.bucketId, key, size: result.size },
      });

      return serializeStorageObject(saved);
    },

    async openDownload(organizationId, objectId, options) {
      if (options?.versionId) {
        const { object, bucket, provider, version } = await requireVersion(
          organizationId,
          objectId,
          options.versionId,
        );
        if (version.isDeleteMarker || version.physicalKey.length === 0) {
          throw storageObjectNotFound();
        }

        const stream = await provider.getObject({
          ...storage.locationFor(bucket, version.physicalKey),
          range: options.range,
          signal: options.signal,
        });
        return { object, stream };
      }

      const { object, bucket, provider } = await requireLiveObject(organizationId, objectId);
      const stream = await provider.getObject({
        ...storage.locationFor(bucket, object.physicalKey),
        range: options?.range,
        signal: options?.signal,
      });

      return { object, stream };
    },

    /**
     * Issues a short-lived download URL after authorization has already passed.
     *
     * For providers that sign natively the provider's own presigned URL is
     * used; otherwise VaultStack issues an HMAC token scoped to this one
     * object (and optional version). Either way the browser receives no
     * storage credentials.
     */
    async createDownloadUrl(organizationId, objectId, baseUrl, versionId) {
      if (versionId) {
        const { object, bucket, provider, version } = await requireVersion(
          organizationId,
          objectId,
          versionId,
        );
        if (version.isDeleteMarker || version.physicalKey.length === 0) {
          throw storageObjectNotFound();
        }

        if (provider.capabilities.nativePresignedUrls) {
          const presigned = await provider.createPresignedDownloadUrl({
            ...storage.locationFor(bucket, version.physicalKey),
            expiresInSeconds: limits.presignedUrlTtlSeconds,
            downloadFilename: object.key.split('/').at(-1),
          });
          return {
            url: presigned.url,
            method: presigned.method,
            expiresAt: presigned.expiresAt.toISOString(),
          };
        }

        const issued = tokens.issue(
          { purpose: 'download', organizationId, subjectId: object.id, versionId },
          limits.presignedUrlTtlSeconds,
        );
        return {
          url: `${baseUrl}/api/v1/storage/objects/${object.id}/content?token=${issued.token}`,
          method: 'GET',
          expiresAt: issued.expiresAt.toISOString(),
        };
      }

      const { object, bucket, provider } = await requireLiveObject(organizationId, objectId);

      if (provider.capabilities.nativePresignedUrls) {
        const presigned = await provider.createPresignedDownloadUrl({
          ...storage.locationFor(bucket, object.physicalKey),
          expiresInSeconds: limits.presignedUrlTtlSeconds,
          downloadFilename: object.key.split('/').at(-1),
        });

        return {
          url: presigned.url,
          method: presigned.method,
          expiresAt: presigned.expiresAt.toISOString(),
        };
      }

      const issued = tokens.issue(
        { purpose: 'download', organizationId, subjectId: object.id },
        limits.presignedUrlTtlSeconds,
      );

      return {
        url: `${baseUrl}/api/v1/storage/objects/${object.id}/content?token=${issued.token}`,
        method: 'GET',
        expiresAt: issued.expiresAt.toISOString(),
      };
    },

    async remove(organizationId, objectId, userId, meta, versionId) {
      if (versionId) {
        await deletePermanentVersion(organizationId, objectId, versionId, userId, meta);
        return;
      }

      const { object, bucket, provider } = await requireObject(organizationId, objectId);

      if (usesDeleteMarkers(bucket.versioning) && !object.isDeleted) {
        const markerVersionId = storage.newVersionId();
        await publishObjectVersion(prisma, {
          organizationId,
          bucketId: object.bucketId,
          storageProviderId: object.storageProviderId,
          objectId: object.id,
          existingId: object.id,
          key: object.key,
          versionId: markerVersionId,
          physicalKey: '',
          size: BigInt(0),
          contentType: object.contentType,
          etag: '',
          checksum: null,
          isDeleteMarker: true,
        });

        await writeAuditLog(prisma, {
          organizationId,
          userId,
          action: 'storage.object.delete_marker',
          resourceType: 'object',
          resourceId: objectId,
          metadata: { bucketId: object.bucketId, key: object.key, versionId: markerVersionId },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return;
      }

      const versions = await objects.listVersions(organizationId, objectId);
      await objects.delete(organizationId, objectId);

      for (const version of versions) {
        await deleteVersionBytes(
          {
            provider,
            locationFor: (key) => storage.locationFor(bucket, key),
            logger,
            objectId,
          },
          version,
        );
      }

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.object.deleted',
        resourceType: 'object',
        resourceId: objectId,
        metadata: { bucketId: object.bucketId, key: object.key },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },

    async listVersions(organizationId, objectId) {
      const { object } = await requireObject(organizationId, objectId);
      const versions = await objects.listVersions(organizationId, objectId);
      return {
        objectId: object.id,
        key: object.key,
        versions: versions.map(serializeObjectVersion),
      };
    },

    async getVersion(organizationId, objectId, versionId) {
      const { version } = await requireVersion(organizationId, objectId, versionId);
      return serializeObjectVersion(version);
    },

    async restoreVersion(organizationId, objectId, versionId, userId, meta) {
      const { object, bucket, provider, version } = await requireVersion(
        organizationId,
        objectId,
        versionId,
      );
      if (version.isDeleteMarker || version.physicalKey.length === 0) {
        throw validationError('A delete marker cannot be restored');
      }

      const restoredVersionId = storage.newVersionId();
      const physicalKey = storage.physicalKeyFor({
        organizationId,
        objectId: object.id,
        versionId: restoredVersionId,
      });

      const result = await provider.copyObject({
        source: storage.locationFor(bucket, version.physicalKey),
        destination: storage.locationFor(bucket, physicalKey),
        contentType: version.contentType,
      });

      const saved = await publishObjectVersion(prisma, {
        organizationId,
        bucketId: object.bucketId,
        storageProviderId: object.storageProviderId,
        objectId: object.id,
        existingId: object.id,
        key: object.key,
        versionId: restoredVersionId,
        physicalKey,
        size: BigInt(result.size || Number(version.size)),
        contentType: result.contentType,
        etag: result.etag || version.etag,
        checksum:
          result.checksum.algorithm === 'SHA256' && result.checksum.value
            ? result.checksum.value
            : version.checksum,
      }).catch(async (error: unknown) => {
        await provider.deleteObject(storage.locationFor(bucket, physicalKey)).catch(() => undefined);
        throw error;
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.object.version_restored',
        resourceType: 'object',
        resourceId: object.id,
        metadata: { sourceVersionId: versionId, restoredVersionId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeStorageObject(saved);
    },

    async copy(input) {
      const source = await requireLiveObject(input.organizationId, input.objectId);
      const destinationKey = assertValidObjectKey(input.destinationKey, limits.maxKeyLength);
      const destination = await storage.resolveBucket(
        input.organizationId,
        input.destinationBucketId,
      );

      const existing = await objects.findByKey(
        input.organizationId,
        destination.bucket.id,
        destinationKey,
      );

      const objectId = existing?.id ?? storage.newObjectId();
      const versionId = storage.newVersionId();
      const physicalKey = storage.physicalKeyFor({
        organizationId: input.organizationId,
        objectId,
        versionId,
      });

      const result = await destination.provider.copyObject({
        source: storage.locationFor(source.bucket, source.object.physicalKey),
        destination: storage.locationFor(destination.bucket, physicalKey),
        contentType: source.object.contentType,
      });

      const saved = await publishObjectVersion(prisma, {
        organizationId: input.organizationId,
        bucketId: destination.bucket.id,
        storageProviderId: destination.providerRecord.id,
        objectId,
        existingId: existing?.id,
        key: destinationKey,
        versionId,
        physicalKey,
        size: BigInt(result.size || Number(source.object.size)),
        contentType: result.contentType,
        etag: result.etag || source.object.etag,
        checksum:
          result.checksum.algorithm === 'SHA256' && result.checksum.value
            ? result.checksum.value
            : source.object.checksum,
      }).catch(async (error: unknown) => {
        await destination.provider
          .deleteObject(storage.locationFor(destination.bucket, physicalKey))
          .catch(() => undefined);
        throw error;
      });

      await reclaimSupersededVersions({
        prisma,
        provider: destination.provider,
        locationFor: (key) => storage.locationFor(destination.bucket, key),
        organizationId: input.organizationId,
        objectId: saved.id,
        versioning: destination.bucket.versioning,
        logger,
      });

      await writeAuditLog(prisma, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: 'storage.object.copied',
        resourceType: 'object',
        resourceId: saved.id,
        metadata: {
          sourceObjectId: source.object.id,
          destinationBucketId: destination.bucket.id,
          destinationKey,
        },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });

      return serializeStorageObject(saved);
    },

    /**
     * Moves an object.
     *
     * Within a bucket this is a metadata-only rename, because the physical
     * location is derived from ids rather than the key, so no bytes move.
     * Across buckets it is modelled as copy, verify, then delete the source:
     * the source is never removed before the destination is confirmed.
     */
    async move(input) {
      const source = await requireLiveObject(input.organizationId, input.objectId);
      const destinationKey = assertValidObjectKey(input.destinationKey, limits.maxKeyLength);

      if (source.object.bucketId === input.destinationBucketId) {
        const clash = await objects.findByKey(
          input.organizationId,
          input.destinationBucketId,
          destinationKey,
        );

        if (clash && clash.id !== source.object.id) {
          throw validationError('An object already exists at the destination key');
        }

        const renamed = await objects.updateKey(
          input.organizationId,
          source.object.id,
          destinationKey,
        );

        await writeAuditLog(prisma, {
          organizationId: input.organizationId,
          userId: input.userId,
          action: 'storage.object.moved',
          resourceType: 'object',
          resourceId: renamed.id,
          metadata: { fromKey: source.object.key, toKey: destinationKey },
          ipAddress: input.meta.ipAddress,
          userAgent: input.meta.userAgent,
        });

        return serializeStorageObject(renamed);
      }

      const copied = await service.copy(input);

      const verification = await requireObject(input.organizationId, copied.id);
      const head = await verification.provider.headObject(
        storage.locationFor(verification.bucket, verification.object.physicalKey),
      );

      if (!head) {
        throw storageObjectNotFound();
      }

      // Only now, with the destination confirmed present, is the source removed.
      await service.remove(input.organizationId, source.object.id, input.userId, input.meta);

      return copied;
    },
  };

  return service;
}

function checkIntegrity(
  options: PutObjectOptions,
  result: { size: number; checksum: { algorithm: string; value: string } },
): Error | null {
  if (options.expectedSize !== undefined && options.expectedSize !== result.size) {
    return storageSizeMismatch();
  }

  if (
    options.expectedChecksumSha256 &&
    result.checksum.algorithm === 'SHA256' &&
    result.checksum.value.toLowerCase() !== options.expectedChecksumSha256.toLowerCase()
  ) {
    return storageChecksumMismatch();
  }

  return null;
}

function assertMetadataSize(metadata: Record<string, string> | undefined, maxBytes: number): void {
  if (!metadata) {
    return;
  }

  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > maxBytes) {
    throw validationError(`Custom metadata must be at most ${maxBytes} bytes`);
  }
}
