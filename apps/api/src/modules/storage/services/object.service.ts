import { Readable } from 'node:stream';
import { ChecksumAlgorithm, type PrismaClient, type StorageObject } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type {
  PublicObjectListPage,
  PublicObjectVersion,
  PublicObjectVersionListPage,
  PublicPresignedUrl,
  PublicStorageFolder,
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
import {
  assertValidKeyPrefix,
  assertValidObjectKey,
  buildFolderMarkerKey,
  assertValidFolderMarkerKey,
} from '../domain/object-key.js';
import type { GetObjectResult } from '../domain/storage.types.js';
import { usesDeleteMarkers } from '../domain/versioning.js';
import type { ObjectRepository } from '../repositories/object.repository.js';
import type { RequestMeta } from './bucket.service.js';
import { publishObjectVersion } from './publish-object.js';
import { deleteVersionBytes, reclaimSupersededVersions } from './reclaim-versions.js';
import type { StorageMetrics } from './storage.metrics.js';
import type { StorageService } from './storage.service.js';
import type { StorageTokenService } from './storage-token.service.js';
import type {
  FolderAccessAction,
  FolderAuthorizationService,
} from './folder-authorization.service.js';

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
  allowFolderMarker?: boolean;
  auditAction?: string;
  auditMeta?: RequestMeta;
}

export interface ListOptions {
  prefix?: string;
  search?: string;
  delimiter?: string;
  includeFolderMarkers?: boolean;
  limit: number;
  cursor?: string;
  userId?: string | null;
  contentType?: string;
  minSize?: number;
  maxSize?: number;
  modifiedFrom?: Date;
  modifiedTo?: Date;
  folderPrefix?: string;
  tag?: string;
  externallyShared?: boolean;
  versioned?: boolean;
  processingState?: string;
}

export interface ObjectService {
  list(
    organizationId: string,
    bucketId: string,
    options: ListOptions,
  ): Promise<PublicObjectListPage>;
  get(
    organizationId: string,
    objectId: string,
    userId?: string | null,
  ): Promise<PublicStorageObject>;
  updateMetadata(
    organizationId: string,
    objectId: string,
    input: { description?: string | null; tags?: string[] },
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicStorageObject>;
  findByKey(
    organizationId: string,
    bucketId: string,
    key: string,
    userId?: string | null,
  ): Promise<PublicStorageObject>;
  createFolder(
    organizationId: string,
    bucketId: string,
    name: string,
    parentPrefix: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicStorageObject>;
  put(options: PutObjectOptions): Promise<PublicStorageObject>;
  openDownload(
    organizationId: string,
    objectId: string,
    options?: {
      range?: { start: number; end?: number };
      signal?: AbortSignal;
      versionId?: string;
      userId?: string | null;
    },
  ): Promise<{ object: StorageObject; stream: GetObjectResult }>;
  createDownloadUrl(
    organizationId: string,
    objectId: string,
    baseUrl: string,
    versionId?: string,
    userId?: string,
    meta?: RequestMeta,
  ): Promise<PublicPresignedUrl>;
  remove(
    organizationId: string,
    objectId: string,
    userId: string,
    meta: RequestMeta,
    versionId?: string,
  ): Promise<void>;
  listVersions(
    organizationId: string,
    objectId: string,
    userId?: string | null,
  ): Promise<PublicObjectVersionListPage>;
  getVersion(
    organizationId: string,
    objectId: string,
    versionId: string,
    userId?: string | null,
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
    allowFolderMarker?: boolean;
    userId: string;
    meta: RequestMeta;
  }): Promise<PublicStorageObject>;
  move(input: {
    organizationId: string;
    objectId: string;
    destinationBucketId: string;
    destinationKey: string;
    allowFolderMarker?: boolean;
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
  folderAuthorization?: FolderAuthorizationService;
}): ObjectService {
  const { prisma, objects, storage, tokens, metrics, logger, folderAuthorization } = deps;
  const limits = storage.limits;

  async function assertFolderAccess(
    organizationId: string,
    bucketId: string,
    key: string,
    userId: string | null | undefined,
    action: FolderAccessAction,
  ): Promise<void> {
    if (!userId || !folderAuthorization) {
      return;
    }
    await folderAuthorization.assert({ organizationId, bucketId, key, userId, action });
  }

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
    await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'DELETE');

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
        search: options.search,
        delimiter: options.delimiter,
        limit: Math.min(options.limit, 1000),
        cursorKey: options.cursor,
        includeFolderMarkers: options.includeFolderMarkers,
          contentType: options.contentType,
          minSize: options.minSize,
          maxSize: options.maxSize,
          modifiedFrom: options.modifiedFrom,
          modifiedTo: options.modifiedTo,
          folderPrefix: options.folderPrefix,
          tag: options.tag,
          externallyShared: options.externallyShared,
          versioned: options.versioned,
          processingState: options.processingState,
      };

      const [page, prefixes] = await Promise.all([
        objects.list(query),
        options.delimiter
          ? objects.listPrefixes({ ...query, includeFolderMarkers: true })
          : Promise.resolve([]),
      ]);
      const delimiter = options.delimiter ?? '/';
      const visibleObjects = options.userId && folderAuthorization
        ? (
            await Promise.all(
              page.objects.map(async (object) =>
                (await folderAuthorization.can({
                  organizationId,
                  bucketId,
                  key: object.key,
                  userId: options.userId,
                  action: 'READ',
                }))
                  ? object
                  : null,
              ),
            )
          ).filter((object): object is StorageObject => object !== null)
        : page.objects;
      const visiblePrefixes = options.userId && folderAuthorization
        ? (
            await Promise.all(
              prefixes.map(async (folderPrefix) =>
                (await folderAuthorization.can({
                  organizationId,
                  bucketId,
                  key: folderPrefix,
                  userId: options.userId,
                  action: 'READ',
                }))
                  ? folderPrefix
                  : null,
              ),
            )
          ).filter((prefix): prefix is string => prefix !== null)
        : prefixes;
      const folders: PublicStorageFolder[] = visiblePrefixes.map((folderPrefix) => ({
        name:
          folderPrefix
            .slice(prefix?.length ?? 0, -delimiter.length)
            .split('/')
            .filter(Boolean)
            .at(-1) ?? folderPrefix,
        prefix: folderPrefix,
        objectCount: null,
      }));

      return {
        objects: visibleObjects.map(serializeStorageObject),
        prefixes: visiblePrefixes,
        folders,
        nextCursor: page.nextCursor,
        isTruncated: page.isTruncated,
      };
    },

    async get(organizationId, objectId, userId) {
      const { object } = await requireLiveObject(organizationId, objectId);
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'READ');
      return serializeStorageObject(object);
    },

    async updateMetadata(organizationId, objectId, input, userId, meta) {
      const object = await objects.findById(organizationId, objectId);
      if (!object) {
        throw storageObjectNotFound();
      }
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'WRITE');
      const existing = isStringRecord(object.metadata) ? object.metadata : {};
      const metadata: Record<string, string> = { ...existing };
      if (input.description !== undefined) {
        if (input.description === null || input.description.length === 0) {
          delete metadata.description;
        } else {
          metadata.description = input.description;
        }
      }
      if (input.tags !== undefined) {
        metadata.tags = JSON.stringify([...new Set(input.tags)]);
      }
      const updated = await prisma.storageObject.update({
        where: { id: objectId },
        data: { metadata },
      });
      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.object.metadata_updated',
        resourceType: 'object',
        resourceId: objectId,
        metadata: { bucketId: object.bucketId, key: object.key },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return serializeStorageObject(updated);
    },

    async findByKey(organizationId, bucketId, key, userId) {
      const normalizedKey = assertValidObjectKey(key, limits.maxKeyLength);
      const object = await objects.findByKey(organizationId, bucketId, normalizedKey);
      if (!object || object.isDeleted) {
        throw storageObjectNotFound();
      }
      await assertFolderAccess(organizationId, bucketId, normalizedKey, userId, 'READ');
      return serializeStorageObject(object);
    },

    async createFolder(organizationId, bucketId, name, parentPrefix, userId, meta) {
      const key = buildFolderMarkerKey(parentPrefix, name, limits.maxKeyLength);
      await assertFolderAccess(organizationId, bucketId, key, userId, 'WRITE');
      const existing = await objects.findByKey(organizationId, bucketId, key);
      if (existing && !existing.isDeleted) {
        return serializeStorageObject(existing);
      }
      return service.put({
        organizationId,
        bucketId,
        key,
        body: Readable.from([]),
        contentType: 'application/x-directory',
        expectedSize: 0,
        metadata: { folderMarker: 'true' },
        userId,
        allowFolderMarker: true,
        auditAction: 'storage.folder.created',
        auditMeta: meta,
      });
    },

    async put(options) {
      const key = options.allowFolderMarker
        ? assertValidFolderMarkerKey(options.key, limits.maxKeyLength)
        : assertValidObjectKey(options.key, limits.maxKeyLength);
      assertMetadataSize(options.metadata, limits.maxMetadataBytes);
      await assertFolderAccess(
        options.organizationId,
        options.bucketId,
        key,
        options.userId,
        'WRITE',
      );

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
        action: options.auditAction ?? 'storage.object.uploaded',
        resourceType: 'object',
        resourceId: saved.id,
        metadata: { bucketId: options.bucketId, key, size: result.size },
        ipAddress: options.auditMeta?.ipAddress,
        userAgent: options.auditMeta?.userAgent,
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
        await assertFolderAccess(
          organizationId,
          object.bucketId,
          object.key,
          options.userId,
          'READ',
        );
        if (version.isDeleteMarker || version.physicalKey.length === 0) {
          throw storageObjectNotFound();
        }

        const stream = await provider.getObject({
          ...storage.locationFor(bucket, version.physicalKey),
          range: options.range,
          signal: options.signal,
        });
        await writeAuditLog(prisma, {
          organizationId,
          action: 'storage.object.downloaded',
          resourceType: 'object',
          resourceId: object.id,
          metadata: { bucketId: object.bucketId, key: object.key },
        });
        return { object, stream };
      }

      const { object, bucket, provider } = await requireLiveObject(organizationId, objectId);
      await assertFolderAccess(
        organizationId,
        object.bucketId,
        object.key,
        options?.userId,
        'READ',
      );
      const stream = await provider.getObject({
        ...storage.locationFor(bucket, object.physicalKey),
        range: options?.range,
        signal: options?.signal,
      });
      await writeAuditLog(prisma, {
        organizationId,
        action: 'storage.object.downloaded',
        resourceType: 'object',
        resourceId: object.id,
        metadata: { bucketId: object.bucketId, key: object.key },
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
    async createDownloadUrl(organizationId, objectId, baseUrl, versionId, userId, meta) {
      if (versionId) {
        const { object, bucket, provider, version } = await requireVersion(
          organizationId,
          objectId,
          versionId,
        );
        await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'READ');
        if (version.isDeleteMarker || version.physicalKey.length === 0) {
          throw storageObjectNotFound();
        }

        if (provider.capabilities.nativePresignedUrls) {
          const presigned = await provider.createPresignedDownloadUrl({
            ...storage.locationFor(bucket, version.physicalKey),
            expiresInSeconds: limits.presignedUrlTtlSeconds,
            downloadFilename: object.key.split('/').at(-1),
          });
          const download = {
            url: presigned.url,
            method: presigned.method,
            expiresAt: presigned.expiresAt.toISOString(),
          };
          await writeAuditLog(prisma, {
            organizationId,
            userId,
            action: 'storage.object.downloaded',
            resourceType: 'object',
            resourceId: object.id,
            metadata: { bucketId: object.bucketId, key: object.key, versionId },
            ipAddress: meta?.ipAddress,
            userAgent: meta?.userAgent,
            requestId: meta?.requestId,
          });
          return download;
        }

        const issued = tokens.issue(
          { purpose: 'download', organizationId, subjectId: object.id, versionId, actorId: userId },
          limits.presignedUrlTtlSeconds,
        );
        const download = {
          url: `${baseUrl}/api/v1/storage/objects/${object.id}/content?token=${issued.token}`,
          method: 'GET',
          expiresAt: issued.expiresAt.toISOString(),
        };
        await writeAuditLog(prisma, {
          organizationId,
          userId,
          action: 'storage.object.downloaded',
          resourceType: 'object',
          resourceId: object.id,
          metadata: { bucketId: object.bucketId, key: object.key, versionId },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          requestId: meta?.requestId,
        });
        return download;
      }

      const { object, bucket, provider } = await requireLiveObject(organizationId, objectId);
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'READ');

      if (provider.capabilities.nativePresignedUrls) {
        const presigned = await provider.createPresignedDownloadUrl({
          ...storage.locationFor(bucket, object.physicalKey),
          expiresInSeconds: limits.presignedUrlTtlSeconds,
          downloadFilename: object.key.split('/').at(-1),
        });

        const download = {
          url: presigned.url,
          method: presigned.method,
          expiresAt: presigned.expiresAt.toISOString(),
        };
        await writeAuditLog(prisma, {
          organizationId,
          userId,
          action: 'storage.object.downloaded',
          resourceType: 'object',
          resourceId: object.id,
          metadata: { bucketId: object.bucketId, key: object.key },
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          requestId: meta?.requestId,
        });
        return download;
      }

      const issued = tokens.issue(
        { purpose: 'download', organizationId, subjectId: object.id, actorId: userId },
        limits.presignedUrlTtlSeconds,
      );

      const download = {
        url: `${baseUrl}/api/v1/storage/objects/${object.id}/content?token=${issued.token}`,
        method: 'GET',
        expiresAt: issued.expiresAt.toISOString(),
      };
      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'storage.object.downloaded',
        resourceType: 'object',
        resourceId: object.id,
        metadata: { bucketId: object.bucketId, key: object.key },
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        requestId: meta?.requestId,
      });
      return download;
    },

    async remove(organizationId, objectId, userId, meta, versionId) {
      if (versionId) {
        await deletePermanentVersion(organizationId, objectId, versionId, userId, meta);
        return;
      }

      const { object, bucket, provider } = await requireObject(organizationId, objectId);
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'DELETE');

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

    async listVersions(organizationId, objectId, userId) {
      const { object } = await requireObject(organizationId, objectId);
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'READ');
      const versions = await objects.listVersions(organizationId, objectId);
      return {
        objectId: object.id,
        key: object.key,
        versions: versions.map(serializeObjectVersion),
      };
    },

    async getVersion(organizationId, objectId, versionId, userId) {
      const { object, version } = await requireVersion(organizationId, objectId, versionId);
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'READ');
      return serializeObjectVersion(version);
    },

    async restoreVersion(organizationId, objectId, versionId, userId, meta) {
      const { object, bucket, provider, version } = await requireVersion(
        organizationId,
        objectId,
        versionId,
      );
      await assertFolderAccess(organizationId, object.bucketId, object.key, userId, 'WRITE');
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
        await provider
          .deleteObject(storage.locationFor(bucket, physicalKey))
          .catch(() => undefined);
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
      await assertFolderAccess(
        input.organizationId,
        source.object.bucketId,
        source.object.key,
        input.userId,
        'READ',
      );
      const destinationKey = input.allowFolderMarker
        ? assertValidFolderMarkerKey(input.destinationKey, limits.maxKeyLength)
        : assertValidObjectKey(input.destinationKey, limits.maxKeyLength);
      const destination = await storage.resolveBucket(
        input.organizationId,
        input.destinationBucketId,
      );
      await assertFolderAccess(
        input.organizationId,
        destination.bucket.id,
        destinationKey,
        input.userId,
        'WRITE',
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
      await assertFolderAccess(
        input.organizationId,
        source.object.bucketId,
        source.object.key,
        input.userId,
        'DELETE',
      );
      const destinationKey = input.allowFolderMarker
        ? assertValidFolderMarkerKey(input.destinationKey, limits.maxKeyLength)
        : assertValidObjectKey(input.destinationKey, limits.maxKeyLength);

      if (source.object.bucketId === input.destinationBucketId) {
        const clash = await objects.findByKey(
          input.organizationId,
          input.destinationBucketId,
          destinationKey,
        );

        if (clash && clash.id !== source.object.id) {
          throw validationError('An object already exists at the destination key', {
            destinationKey: 'An object already exists at the destination key',
          });
        }
        await assertFolderAccess(
          input.organizationId,
          input.destinationBucketId,
          destinationKey,
          input.userId,
          'WRITE',
        );

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

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
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
