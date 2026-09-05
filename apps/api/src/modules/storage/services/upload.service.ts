import type { Readable } from 'node:stream';
import { hashToken } from '@vaultstack/auth';
import { MultipartUploadStatus, UploadStatus, type PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { PublicStorageObject, PublicUpload } from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import {
  AppError,
  storageChecksumMismatch,
  storageChecksumUnverifiable,
  storageMultipartInvalidPart,
  storageMultipartNotFound,
  storageObjectNotFound,
  storageObjectTooLarge,
  storageSizeMismatch,
  storageUploadExpired,
  storageUploadInvalidState,
  storageUploadNotFound,
  validationError,
} from '../../../lib/errors.js';
import { serializeStorageObject, serializeUpload } from '../../../lib/serializers.js';
import { ObjectTooLargeError } from '../domain/integrity.js';
import { assertValidObjectKey } from '../domain/object-key.js';
import type { UploadRepository } from '../repositories/upload.repository.js';
import type { ObjectRepository } from '../repositories/object.repository.js';
import type { RequestMeta } from './bucket.service.js';
import { publishObjectVersion } from './publish-object.js';
import type { StorageMetrics } from './storage.metrics.js';
import type { StorageService } from './storage.service.js';
import type { StorageTokenService } from './storage-token.service.js';

export interface InitiateUploadInput {
  organizationId: string;
  bucketId: string;
  key: string;
  contentType?: string;
  size?: number;
  userId: string;
  baseUrl: string;
  meta: RequestMeta;
}

export interface InitiatedUpload {
  upload: PublicUpload;
  uploadUrl: string;
  method: 'PUT';
  expiresAt: string;
  headers?: Record<string, string>;
}

export interface InitiateMultipartInput {
  organizationId: string;
  bucketId: string;
  key: string;
  contentType?: string;
  userId: string;
  meta: RequestMeta;
}

export interface UploadService {
  initiate(input: InitiateUploadInput): Promise<InitiatedUpload>;
  receive(input: {
    uploadId: string;
    token: string;
    body: Readable;
    signal?: AbortSignal;
  }): Promise<PublicUpload>;
  complete(input: {
    organizationId: string;
    uploadId: string;
    userId: string;
    checksumSha256?: string;
    meta: RequestMeta;
  }): Promise<PublicStorageObject>;
  abort(input: {
    organizationId: string;
    uploadId: string;
    userId: string;
    meta: RequestMeta;
  }): Promise<void>;

  initiateMultipart(input: InitiateMultipartInput): Promise<{ uploadId: string; key: string }>;
  uploadPart(input: {
    organizationId: string;
    uploadId: string;
    partNumber: number;
    body: Readable;
    signal?: AbortSignal;
  }): Promise<{ partNumber: number; etag: string; size: number }>;
  completeMultipart(input: {
    organizationId: string;
    uploadId: string;
    userId: string;
    parts: { partNumber: number; etag: string }[];
    meta: RequestMeta;
  }): Promise<PublicStorageObject>;
  abortMultipart(input: {
    organizationId: string;
    uploadId: string;
    userId: string;
    meta: RequestMeta;
  }): Promise<void>;

  /** Expires abandoned uploads and reclaims their staged bytes. */
  cleanupExpired(): Promise<{ uploads: number; multipart: number }>;
}

export function createUploadService(deps: {
  prisma: PrismaClient;
  uploads: UploadRepository;
  objects: ObjectRepository;
  storage: StorageService;
  tokens: StorageTokenService;
  metrics: StorageMetrics;
  logger: Logger;
}): UploadService {
  const { prisma, uploads, objects, storage, tokens, metrics, logger } = deps;
  const limits = storage.limits;

  return {
    /**
     * Reserves an upload and hands back an authorized destination.
     *
     * For S3-compatible providers this is a provider presigned PUT so the
     * browser uploads directly; for the local filesystem it is a VaultStack
     * URL carrying a scoped HMAC token. In neither case does the browser
     * receive storage credentials.
     */
    async initiate(input) {
      const key = assertValidObjectKey(input.key, limits.maxKeyLength);

      if (input.size !== undefined && input.size > limits.maxObjectSizeBytes) {
        throw storageObjectTooLarge(limits.maxObjectSizeBytes);
      }

      const resolved = await storage.resolveBucket(input.organizationId, input.bucketId);

      const existing = await objects.findByKey(input.organizationId, input.bucketId, key);
      const objectId = existing?.id ?? storage.newObjectId();
      const versionId = storage.newVersionId();
      const stagingKey = storage.physicalKeyFor({
        organizationId: input.organizationId,
        objectId,
        versionId,
      });

      // The plaintext token is returned once and only its hash is persisted.
      const issued = tokens.issue(
        { purpose: 'upload', organizationId: input.organizationId, subjectId: objectId },
        limits.uploadTtlSeconds,
      );

      const row = await uploads.create({
        organizationId: input.organizationId,
        bucketId: input.bucketId,
        userId: input.userId,
        key,
        contentType: input.contentType ?? null,
        declaredSize: input.size === undefined ? null : BigInt(input.size),
        tokenHash: hashToken(issued.token),
        stagingKey,
        providerUploadId: null,
        expiresAt: issued.expiresAt,
      });

      const location = storage.locationFor(resolved.bucket, stagingKey);

      if (resolved.provider.capabilities.nativePresignedUrls) {
        // A provider-presigned PUT goes straight from the browser to the
        // endpoint, so VaultStack never sees the bytes and cannot stop an
        // oversized body mid-stream. Declaring the size is therefore mandatory
        // here, and it is signed into the URL so the provider itself rejects a
        // body of any other length.
        if (input.size === undefined) {
          throw validationError(
            'size is required when uploading directly to this storage provider',
          );
        }

        const presigned = await resolved.provider.createPresignedUploadUrl({
          ...location,
          expiresInSeconds: limits.uploadTtlSeconds,
          contentType: input.contentType,
          contentLength: input.size,
        });

        await writeAuditLog(prisma, {
          organizationId: input.organizationId,
          userId: input.userId,
          action: 'storage.upload.initiated',
          resourceType: 'upload',
          resourceId: row.id,
          metadata: { bucketId: input.bucketId, key, presigned: true },
          ipAddress: input.meta.ipAddress,
          userAgent: input.meta.userAgent,
        });

        return {
          upload: serializeUpload(row),
          uploadUrl: presigned.url,
          method: 'PUT',
          expiresAt: presigned.expiresAt.toISOString(),
          headers: presigned.headers,
        };
      }

      await writeAuditLog(prisma, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: 'storage.upload.initiated',
        resourceType: 'upload',
        resourceId: row.id,
        metadata: { bucketId: input.bucketId, key, presigned: false },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });

      return {
        upload: serializeUpload(row),
        uploadUrl: `${input.baseUrl}/api/v1/storage/uploads/${row.id}/content?token=${issued.token}`,
        method: 'PUT',
        expiresAt: issued.expiresAt.toISOString(),
        ...(input.contentType ? { headers: { 'content-type': input.contentType } } : {}),
      };
    },

    /**
     * Streams an upload body to its reserved physical location.
     *
     * Authorization comes from the upload token alone, which is why the token
     * hash is matched against the specific upload row: a token for one upload
     * cannot be replayed against another.
     */
    async receive(input) {
      const claims = tokens.verify(input.token, 'upload');

      const row = await uploads.findByTokenHash(hashToken(input.token));
      if (row?.id !== input.uploadId) {
        throw storageUploadNotFound();
      }

      if (row.organizationId !== claims.organizationId) {
        throw storageUploadNotFound();
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        await uploads.setStatus(row.id, UploadStatus.EXPIRED);
        throw storageUploadExpired();
      }

      if (row.status !== UploadStatus.PENDING && row.status !== UploadStatus.UPLOADING) {
        throw storageUploadInvalidState(`Upload is ${row.status.toLowerCase()}`);
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);
      const location = storage.locationFor(resolved.bucket, row.stagingKey);

      await uploads.setStatus(row.id, UploadStatus.UPLOADING);
      metrics.uploadStarted();

      try {
        const result = await resolved.provider.putObject({
          ...location,
          body: input.body,
          contentType: row.contentType ?? undefined,
          maxSizeBytes: limits.maxObjectSizeBytes,
          signal: input.signal,
        });

        const updated = await prisma.upload.update({
          where: { id: row.id },
          data: {
            receivedSize: BigInt(result.size),
            checksum: result.checksum.value || null,
            status: UploadStatus.UPLOADING,
          },
        });

        return serializeUpload(updated);
      } catch (error) {
        // Staged bytes are removed so an interrupted upload leaves nothing behind.
        await resolved.provider.deleteObject(location).catch(() => undefined);
        await uploads.setStatus(
          row.id,
          UploadStatus.FAILED,
          error instanceof Error ? error.name : 'unknown',
        );

        metrics.uploadFailed({
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          reason: error instanceof Error ? error.name : 'unknown',
        });

        if (error instanceof ObjectTooLargeError) {
          throw storageObjectTooLarge(error.maxSizeBytes);
        }
        throw error;
      }
    },

    /**
     * Publishes a finished upload as an object version.
     *
     * The bytes are confirmed present and integrity-checked before any
     * metadata is written, so a completed upload can never point at data that
     * is missing or corrupt.
     */
    async complete(input) {
      const row = await uploads.findById(input.organizationId, input.uploadId);
      if (!row) {
        throw storageUploadNotFound();
      }

      if (row.status === UploadStatus.COMPLETED) {
        throw storageUploadInvalidState('Upload is already completed');
      }

      if (
        row.status === UploadStatus.ABORTED ||
        row.status === UploadStatus.EXPIRED ||
        row.status === UploadStatus.FAILED
      ) {
        throw storageUploadInvalidState(`Upload is ${row.status.toLowerCase()}`);
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        await uploads.setStatus(row.id, UploadStatus.EXPIRED);
        throw storageUploadExpired();
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);
      const location = storage.locationFor(resolved.bucket, row.stagingKey);

      await uploads.setStatus(row.id, UploadStatus.COMPLETING);

      const head = await resolved.provider.headObject(location);
      if (!head) {
        await uploads.setStatus(row.id, UploadStatus.FAILED, 'missing_body');
        throw storageObjectNotFound();
      }

      // Bytes written through a provider-presigned URL never pass through the
      // API, so the ceiling cannot be enforced mid-stream for those uploads.
      // Measuring what actually landed is the only reliable check, and it runs
      // before any metadata is published so oversized bytes are never readable.
      if (head.size > limits.maxObjectSizeBytes) {
        await uploads.setStatus(row.id, UploadStatus.FAILED, 'too_large');
        await resolved.provider.deleteObject(location).catch(() => undefined);
        throw storageObjectTooLarge(limits.maxObjectSizeBytes);
      }

      if (row.declaredSize !== null && Number(row.declaredSize) !== head.size) {
        await uploads.setStatus(row.id, UploadStatus.FAILED, 'size_mismatch');
        await resolved.provider.deleteObject(location).catch(() => undefined);
        throw storageSizeMismatch();
      }

      if (input.checksumSha256) {
        // Refusing beats silently succeeding: without a server-computed
        // checksum there is nothing to compare against, and completing anyway
        // would report an integrity guarantee that was never checked.
        if (!row.checksum) {
          await uploads.setStatus(row.id, UploadStatus.FAILED, 'checksum_unverifiable');
          await resolved.provider.deleteObject(location).catch(() => undefined);
          throw storageChecksumUnverifiable();
        }

        if (row.checksum.toLowerCase() !== input.checksumSha256.toLowerCase()) {
          await uploads.setStatus(row.id, UploadStatus.FAILED, 'checksum_mismatch');
          await resolved.provider.deleteObject(location).catch(() => undefined);
          throw storageChecksumMismatch();
        }
      }

      const existing = await objects.findByKey(row.organizationId, row.bucketId, row.key);
      const previousPhysicalKey = existing?.physicalKey;
      const objectId = existing?.id ?? deriveObjectId(row.stagingKey);
      const versionId = deriveVersionId(row.stagingKey);

      let saved;
      try {
        saved = await publishObjectVersion(prisma, {
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          storageProviderId: resolved.providerRecord.id,
          objectId,
          existingId: existing?.id,
          key: row.key,
          versionId,
          physicalKey: row.stagingKey,
          size: BigInt(head.size),
          contentType: head.contentType,
          etag: head.etag,
          checksum: row.checksum,
        });
      } catch (error) {
        await uploads.setStatus(row.id, UploadStatus.FAILED, 'metadata_write_failed');
        await resolved.provider.deleteObject(location).catch(() => undefined);
        throw error;
      }

      await uploads.markCompleted(row.id, saved.id, BigInt(head.size), row.checksum ?? '');

      if (previousPhysicalKey && previousPhysicalKey !== row.stagingKey) {
        await resolved.provider
          .deleteObject(storage.locationFor(resolved.bucket, previousPhysicalKey))
          .catch(() => undefined);
      }

      metrics.uploadCompleted({
        organizationId: row.organizationId,
        bucketId: row.bucketId,
        bytes: head.size,
        durationMs: Date.now() - row.createdAt.getTime(),
      });

      await writeAuditLog(prisma, {
        organizationId: row.organizationId,
        userId: input.userId,
        action: 'storage.upload.completed',
        resourceType: 'object',
        resourceId: saved.id,
        metadata: { uploadId: row.id, bucketId: row.bucketId, key: row.key, size: head.size },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });

      return serializeStorageObject(saved);
    },

    async abort(input) {
      const row = await uploads.findById(input.organizationId, input.uploadId);
      if (!row) {
        throw storageUploadNotFound();
      }

      if (row.status === UploadStatus.COMPLETED) {
        throw storageUploadInvalidState('Completed uploads cannot be aborted');
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);
      await resolved.provider
        .deleteObject(storage.locationFor(resolved.bucket, row.stagingKey))
        .catch(() => undefined);

      await uploads.setStatus(row.id, UploadStatus.ABORTED);

      await writeAuditLog(prisma, {
        organizationId: row.organizationId,
        userId: input.userId,
        action: 'storage.upload.aborted',
        resourceType: 'upload',
        resourceId: row.id,
        metadata: { bucketId: row.bucketId, key: row.key },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });
    },

    // --- multipart -------------------------------------------------------

    async initiateMultipart(input) {
      const key = assertValidObjectKey(input.key, limits.maxKeyLength);
      const resolved = await storage.resolveBucket(input.organizationId, input.bucketId);

      const existing = await objects.findByKey(input.organizationId, input.bucketId, key);
      const objectId = existing?.id ?? storage.newObjectId();
      const versionId = storage.newVersionId();
      const stagingKey = storage.physicalKeyFor({
        organizationId: input.organizationId,
        objectId,
        versionId,
      });

      const initiated = await resolved.provider.initiateMultipartUpload({
        ...storage.locationFor(resolved.bucket, stagingKey),
        contentType: input.contentType,
      });

      const row = await uploads.createMultipart({
        organizationId: input.organizationId,
        bucketId: input.bucketId,
        storageProviderId: resolved.providerRecord.id,
        userId: input.userId,
        key,
        contentType: input.contentType ?? null,
        providerUploadId: initiated.providerUploadId,
        stagingKey,
        expiresAt: new Date(Date.now() + limits.uploadTtlSeconds * 1000),
      });

      await writeAuditLog(prisma, {
        organizationId: input.organizationId,
        userId: input.userId,
        action: 'storage.multipart.initiated',
        resourceType: 'multipart_upload',
        resourceId: row.id,
        metadata: { bucketId: input.bucketId, key },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });

      return { uploadId: row.id, key };
    },

    async uploadPart(input) {
      if (input.partNumber < 1 || input.partNumber > limits.multipartMaxParts) {
        throw storageMultipartInvalidPart(
          `Part number must be between 1 and ${limits.multipartMaxParts}`,
        );
      }

      const row = await uploads.findMultipartById(input.organizationId, input.uploadId);
      if (!row) {
        throw storageMultipartNotFound();
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        throw storageUploadExpired();
      }

      if (
        row.status !== MultipartUploadStatus.INITIATED &&
        row.status !== MultipartUploadStatus.UPLOADING
      ) {
        throw storageUploadInvalidState(`Multipart upload is ${row.status.toLowerCase()}`);
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);

      // The size ceiling applies to the assembled object, not to each part in
      // isolation: capping only the individual part would let N parts of the
      // maximum size combine into an object N times over the limit. The
      // remaining budget is handed to the provider so the stream is aborted
      // mid-flight rather than after the bytes have already landed.
      const storedParts = await uploads.listParts(row.id);
      const otherPartBytes = storedParts
        .filter((part) => part.partNumber !== input.partNumber)
        .reduce((total, part) => total + Number(part.size), 0);
      const remainingBytes = limits.maxObjectSizeBytes - otherPartBytes;

      if (remainingBytes <= 0) {
        throw storageObjectTooLarge(limits.maxObjectSizeBytes);
      }

      await uploads.setMultipartStatus(row.id, MultipartUploadStatus.UPLOADING);

      let result;
      try {
        result = await resolved.provider.uploadPart({
          ...storage.locationFor(resolved.bucket, row.stagingKey),
          providerUploadId: row.providerUploadId,
          partNumber: input.partNumber,
          body: input.body,
          maxSizeBytes: remainingBytes,
          signal: input.signal,
        });
      } catch (error) {
        // Providers report the budget they were handed, which is the remaining
        // allowance rather than the configured ceiling. Restating it here keeps
        // the error from implying a smaller limit than actually applies.
        if (isObjectTooLarge(error)) {
          throw storageObjectTooLarge(limits.maxObjectSizeBytes);
        }
        throw error;
      }

      await uploads.upsertPart({
        multipartUploadId: row.id,
        partNumber: result.partNumber,
        size: BigInt(result.size),
        etag: result.etag,
        checksum: null,
      });

      return { partNumber: result.partNumber, etag: result.etag, size: result.size };
    },

    async completeMultipart(input) {
      const row = await uploads.findMultipartById(input.organizationId, input.uploadId);
      if (!row) {
        throw storageMultipartNotFound();
      }

      if (row.status === MultipartUploadStatus.COMPLETED) {
        throw storageUploadInvalidState('Multipart upload is already completed');
      }

      const stored = await uploads.listParts(row.id);
      if (stored.length === 0) {
        throw storageMultipartInvalidPart('No parts have been uploaded');
      }

      // Every part the client claims must match a part the server actually
      // stored, so completion cannot be steered with forged part etags.
      const storedByNumber = new Map(stored.map((part) => [part.partNumber, part]));
      for (const part of input.parts) {
        const match = storedByNumber.get(part.partNumber);
        if (!match) {
          throw storageMultipartInvalidPart(`Unknown part number ${part.partNumber}`);
        }
        if (match.etag !== part.etag.replace(/"/g, '')) {
          throw storageMultipartInvalidPart(`Part ${part.partNumber} etag does not match`);
        }
      }

      const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);

      // All parts except the last must meet the minimum part size.
      for (const part of ordered.slice(0, -1)) {
        const match = storedByNumber.get(part.partNumber);
        if (match && Number(match.size) < limits.multipartMinPartSizeBytes) {
          throw storageMultipartInvalidPart(
            `Part ${part.partNumber} is smaller than the minimum part size`,
          );
        }
      }

      // Re-checked at completion as well as per part: parts can be uploaded
      // concurrently, so the running total each part saw may have been stale.
      const totalBytes = ordered.reduce(
        (total, part) => total + Number(storedByNumber.get(part.partNumber)?.size ?? 0),
        0,
      );

      if (totalBytes > limits.maxObjectSizeBytes) {
        throw storageObjectTooLarge(limits.maxObjectSizeBytes);
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);
      const location = storage.locationFor(resolved.bucket, row.stagingKey);

      await uploads.setMultipartStatus(row.id, MultipartUploadStatus.COMPLETING);

      const result = await resolved.provider.completeMultipartUpload({
        ...location,
        providerUploadId: row.providerUploadId,
        parts: ordered.map((part) => ({
          partNumber: part.partNumber,
          etag: storedByNumber.get(part.partNumber)?.etag ?? part.etag,
        })),
        contentType: row.contentType ?? undefined,
      });

      const existing = await objects.findByKey(row.organizationId, row.bucketId, row.key);
      const objectId = existing?.id ?? deriveObjectId(row.stagingKey);

      let saved;
      try {
        saved = await publishObjectVersion(prisma, {
          organizationId: row.organizationId,
          bucketId: row.bucketId,
          storageProviderId: resolved.providerRecord.id,
          objectId,
          existingId: existing?.id,
          key: row.key,
          versionId: deriveVersionId(row.stagingKey),
          physicalKey: row.stagingKey,
          size: BigInt(result.size),
          contentType: result.contentType,
          // A multipart etag is not a plain content MD5; it is stored as-is.
          etag: result.etag,
          checksum: result.checksum.algorithm === 'SHA256' ? result.checksum.value : null,
        });
      } catch (error) {
        await uploads.setMultipartStatus(row.id, MultipartUploadStatus.ABORTED);
        await resolved.provider.deleteObject(location).catch(() => undefined);
        throw error;
      }

      await uploads.setMultipartStatus(row.id, MultipartUploadStatus.COMPLETED);

      metrics.multipartCompleted({
        organizationId: row.organizationId,
        bucketId: row.bucketId,
        parts: ordered.length,
      });

      await writeAuditLog(prisma, {
        organizationId: row.organizationId,
        userId: input.userId,
        action: 'storage.multipart.completed',
        resourceType: 'object',
        resourceId: saved.id,
        metadata: { uploadId: row.id, key: row.key, parts: ordered.length },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });

      return serializeStorageObject(saved);
    },

    async abortMultipart(input) {
      const row = await uploads.findMultipartById(input.organizationId, input.uploadId);
      if (!row) {
        throw storageMultipartNotFound();
      }

      const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);

      await resolved.provider
        .abortMultipartUpload({
          ...storage.locationFor(resolved.bucket, row.stagingKey),
          providerUploadId: row.providerUploadId,
        })
        .catch(() => undefined);

      await uploads.setMultipartStatus(row.id, MultipartUploadStatus.ABORTED);

      await writeAuditLog(prisma, {
        organizationId: row.organizationId,
        userId: input.userId,
        action: 'storage.multipart.aborted',
        resourceType: 'multipart_upload',
        resourceId: row.id,
        metadata: { bucketId: row.bucketId, key: row.key },
        ipAddress: input.meta.ipAddress,
        userAgent: input.meta.userAgent,
      });
    },

    /**
     * Reclaims abandoned uploads so staged parts are not kept forever.
     * Intended to be driven by a scheduled worker in a later phase.
     */
    async cleanupExpired() {
      const now = new Date();
      const expiredUploads = await uploads.expireStale(now);
      const stale = await uploads.findStaleMultipart(now);

      let cleaned = 0;
      for (const row of stale) {
        try {
          const resolved = await storage.resolveBucket(row.organizationId, row.bucketId);
          await resolved.provider
            .abortMultipartUpload({
              ...storage.locationFor(resolved.bucket, row.stagingKey),
              providerUploadId: row.providerUploadId,
            })
            .catch(() => undefined);
          await uploads.setMultipartStatus(row.id, MultipartUploadStatus.EXPIRED);
          cleaned += 1;
        } catch (error) {
          logger.warn(
            {
              event: 'storage.multipart.cleanup_failed',
              multipartUploadId: row.id,
              reason: error instanceof Error ? error.name : 'unknown',
            },
            'Stale multipart upload could not be cleaned up',
          );
        }
      }

      return { uploads: expiredUploads, multipart: cleaned };
    },
  };
}

/**
 * Physical keys are built as `<org>/<fanout>/<objectId>/<versionId>`, so the
 * ids reserved at initiate time can be recovered at completion without
 * trusting anything from the client.
 */
function deriveObjectId(stagingKey: string): string {
  const segments = stagingKey.split('/');
  const objectId = segments.at(-2);
  if (!objectId) {
    throw validationError('Upload staging key is malformed');
  }
  return objectId;
}

/**
 * True for a size-ceiling failure, whether it surfaced as the raw stream error
 * or as the AppError a provider already translated it into.
 */
function isObjectTooLarge(error: unknown): boolean {
  return (
    error instanceof ObjectTooLargeError ||
    (error instanceof AppError && error.code === 'STORAGE_OBJECT_TOO_LARGE')
  );
}

function deriveVersionId(stagingKey: string): string {
  const versionId = stagingKey.split('/').at(-1);
  if (!versionId) {
    throw validationError('Upload staging key is malformed');
  }
  return versionId;
}
