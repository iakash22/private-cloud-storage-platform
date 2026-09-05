import { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STORAGE_PROVIDER_TYPES, type StorageProviderTypeName } from '@vaultstack/types';
import {
  storageObjectNotFound,
  storageProviderUnavailable,
  storageUploadFailed,
} from '../../../../lib/errors.js';
import { IntegrityMeter, normalizeEtag } from '../../domain/integrity.js';
import type {
  StorageProvider,
  StorageProviderCapabilities,
} from '../../domain/storage-provider.js';
import type {
  AbortMultipartInput,
  CompleteMultipartInput,
  CopyObjectInput,
  GetObjectInput,
  GetObjectResult,
  HeadObjectResult,
  InitiateMultipartInput,
  InitiateMultipartResult,
  ListObjectsInput,
  PresignedUrl,
  PresignedUrlInput,
  ProviderBucketRef,
  ProviderBucketSummary,
  ProviderHealth,
  ProviderObjectListPage,
  PutObjectInput,
  PutObjectResult,
  StorageLocation,
  UploadPartInput,
  UploadPartResult,
} from '../../domain/storage.types.js';

export interface S3CompatibleProviderOptions {
  client: S3Client;
  region: string;
}

export function createS3CompatibleProvider(options: S3CompatibleProviderOptions): StorageProvider {
  return new S3CompatibleStorageProvider(options);
}

/**
 * Works against any S3-compatible endpoint (AWS S3, Cloudflare R2, Backblaze
 * B2, MinIO, DigitalOcean Spaces, Wasabi, ...).
 *
 * There is intentionally no per-vendor branching: differences are handled by
 * endpoint and path-style configuration on the injected client.
 */
export class S3CompatibleStorageProvider implements StorageProvider {
  readonly type: StorageProviderTypeName = STORAGE_PROVIDER_TYPES.S3_COMPATIBLE;

  readonly capabilities: StorageProviderCapabilities = {
    nativePresignedUrls: true,
    nativeVersioning: true,
    serverSideCopy: true,
  };

  private readonly client: S3Client;
  private readonly region: string;

  constructor(options: S3CompatibleProviderOptions) {
    this.client = options.client;
    this.region = options.region;
  }

  // --- buckets -----------------------------------------------------------

  async createBucket(ref: ProviderBucketRef): Promise<void> {
    await this.guard(async () => {
      await this.client.send(
        new CreateBucketCommand({
          Bucket: ref.physicalBucket,
          // us-east-1 must not send a location constraint.
          ...(this.region && this.region !== 'us-east-1'
            ? { CreateBucketConfiguration: { LocationConstraint: this.region as never } }
            : {}),
        }),
      );
    }, 'Bucket could not be created');
  }

  async listBuckets(): Promise<ProviderBucketSummary[]> {
    const response = await this.guard(
      () => this.client.send(new ListBucketsCommand({})),
      'Buckets could not be listed',
    );

    return (response.Buckets ?? [])
      .filter((bucket): bucket is { Name: string; CreationDate?: Date } => Boolean(bucket.Name))
      .map((bucket) => ({
        physicalBucket: bucket.Name,
        createdAt: bucket.CreationDate ?? null,
      }));
  }

  async getBucket(ref: ProviderBucketRef): Promise<ProviderBucketSummary | null> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: ref.physicalBucket }));
      return { physicalBucket: ref.physicalBucket, createdAt: null };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw storageProviderUnavailable('Bucket could not be read');
    }
  }

  async deleteBucket(ref: ProviderBucketRef): Promise<void> {
    await this.guard(
      () => this.client.send(new DeleteBucketCommand({ Bucket: ref.physicalBucket })),
      'Bucket could not be deleted',
    );
  }

  // --- objects -----------------------------------------------------------

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    // The meter enforces the size ceiling and produces the checksum while the
    // body streams to the endpoint, so large objects are never buffered.
    const meter = new IntegrityMeter(input.maxSizeBytes);
    const body = input.body.pipe(meter);
    const contentType = input.contentType ?? 'application/octet-stream';

    const response = await this.guard(
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            Body: body,
            ContentType: contentType,
            Metadata: input.metadata,
            ...(input.expect?.size === undefined ? {} : { ContentLength: input.expect.size }),
          }),
          { abortSignal: input.signal },
        ),
      'Object upload failed',
    );

    const totals = meter.totals();

    return {
      size: totals.size,
      etag: normalizeEtag(response.ETag ?? totals.md5),
      checksum: { algorithm: 'SHA256', value: totals.sha256 },
      contentType,
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const range = input.range ? `bytes=${input.range.start}-${input.range.end ?? ''}` : undefined;

    let response;
    try {
      response = await this.client.send(
        new GetObjectCommand({
          Bucket: input.physicalBucket,
          Key: input.physicalKey,
          Range: range,
        }),
        { abortSignal: input.signal },
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        throw storageObjectNotFound();
      }
      throw storageProviderUnavailable('Object could not be read');
    }

    if (!response.Body) {
      throw storageObjectNotFound();
    }

    return {
      body: response.Body as Readable,
      size: response.ContentLength ?? 0,
      contentType: response.ContentType ?? 'application/octet-stream',
      etag: normalizeEtag(response.ETag ?? ''),
      lastModified: response.LastModified ?? new Date(),
      contentRange: response.ContentRange,
    };
  }

  async headObject(location: StorageLocation): Promise<HeadObjectResult | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: location.physicalBucket,
          Key: location.physicalKey,
        }),
      );

      return {
        size: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        etag: normalizeEtag(response.ETag ?? ''),
        lastModified: response.LastModified ?? new Date(),
        metadata: response.Metadata,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw storageProviderUnavailable('Object metadata could not be read');
    }
  }

  async deleteObject(location: StorageLocation): Promise<void> {
    await this.guard(
      () =>
        this.client.send(
          new DeleteObjectCommand({
            Bucket: location.physicalBucket,
            Key: location.physicalKey,
          }),
        ),
      'Object could not be deleted',
    );
  }

  async copyObject(input: CopyObjectInput): Promise<PutObjectResult> {
    const response = await this.guard(
      () =>
        this.client.send(
          new CopyObjectCommand({
            Bucket: input.destination.physicalBucket,
            Key: input.destination.physicalKey,
            CopySource: `${input.source.physicalBucket}/${encodeURIComponent(
              input.source.physicalKey,
            )}`,
            ...(input.contentType
              ? { ContentType: input.contentType, MetadataDirective: 'REPLACE' as const }
              : {}),
            ...(input.metadata ? { Metadata: input.metadata } : {}),
          }),
        ),
      'Object could not be copied',
    );

    const head = await this.headObject(input.destination);

    return {
      size: head?.size ?? 0,
      etag: normalizeEtag(response.CopyObjectResult?.ETag ?? head?.etag ?? ''),
      // Server-side copies never stream through the API, so no checksum is
      // recomputed here. The service carries the source checksum forward.
      checksum: { algorithm: 'NONE', value: '' },
      contentType: head?.contentType ?? input.contentType ?? 'application/octet-stream',
    };
  }

  async listObjects(input: ListObjectsInput): Promise<ProviderObjectListPage> {
    const response = await this.guard(
      () =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: input.physicalBucket,
            Prefix: input.prefix,
            Delimiter: input.delimiter,
            MaxKeys: input.maxKeys,
            ContinuationToken: input.cursor,
          }),
        ),
      'Objects could not be listed',
    );

    return {
      objects: (response.Contents ?? [])
        .filter(
          (item): item is { Key: string; Size?: number; ETag?: string; LastModified?: Date } =>
            Boolean(item.Key),
        )
        .map((item) => ({
          physicalKey: item.Key,
          size: item.Size ?? 0,
          etag: normalizeEtag(item.ETag ?? ''),
          lastModified: item.LastModified ?? new Date(),
        })),
      prefixes: (response.CommonPrefixes ?? [])
        .map((prefix) => prefix.Prefix)
        .filter((prefix): prefix is string => Boolean(prefix)),
      nextCursor: response.NextContinuationToken ?? null,
      isTruncated: Boolean(response.IsTruncated),
    };
  }

  // --- multipart ---------------------------------------------------------

  async initiateMultipartUpload(input: InitiateMultipartInput): Promise<InitiateMultipartResult> {
    const response = await this.guard(
      () =>
        this.client.send(
          new CreateMultipartUploadCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            ContentType: input.contentType,
            Metadata: input.metadata,
          }),
        ),
      'Multipart upload could not be created',
    );

    if (!response.UploadId) {
      throw storageUploadFailed('Provider did not return a multipart upload id');
    }

    return { providerUploadId: response.UploadId };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadPartResult> {
    const meter = new IntegrityMeter(input.maxSizeBytes);
    const body = input.body.pipe(meter);

    const response = await this.guard(
      () =>
        this.client.send(
          new UploadPartCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            UploadId: input.providerUploadId,
            PartNumber: input.partNumber,
            Body: body,
          }),
          { abortSignal: input.signal },
        ),
      'Part upload failed',
    );

    const totals = meter.totals();

    return {
      partNumber: input.partNumber,
      size: totals.size,
      etag: normalizeEtag(response.ETag ?? totals.md5),
    };
  }

  async completeMultipartUpload(input: CompleteMultipartInput): Promise<PutObjectResult> {
    const response = await this.guard(
      () =>
        this.client.send(
          new CompleteMultipartUploadCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            UploadId: input.providerUploadId,
            MultipartUpload: {
              Parts: [...input.parts]
                .sort((left, right) => left.partNumber - right.partNumber)
                .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
            },
          }),
        ),
      'Multipart upload could not be completed',
    );

    const head = await this.headObject(input);

    return {
      size: head?.size ?? 0,
      // Multipart ETags are not a plain content MD5; they are stored verbatim.
      etag: normalizeEtag(response.ETag ?? ''),
      checksum: { algorithm: 'NONE', value: '' },
      contentType: head?.contentType ?? input.contentType ?? 'application/octet-stream',
    };
  }

  async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
    await this.guard(
      () =>
        this.client.send(
          new AbortMultipartUploadCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            UploadId: input.providerUploadId,
          }),
        ),
      'Multipart upload could not be aborted',
    );
  }

  // --- presigned URLs ----------------------------------------------------

  async createPresignedDownloadUrl(input: PresignedUrlInput): Promise<PresignedUrl> {
    const command = new GetObjectCommand({
      Bucket: input.physicalBucket,
      Key: input.physicalKey,
      // Scoped to this exact object, and to a download disposition when asked.
      ResponseContentDisposition: input.downloadFilename
        ? `attachment; filename="${sanitizeFilename(input.downloadFilename)}"`
        : undefined,
    });

    const url = await this.guard(
      () => getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds }),
      'Download URL could not be generated',
    );

    return {
      url,
      method: 'GET',
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    };
  }

  async createPresignedUploadUrl(input: PresignedUrlInput): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: input.physicalBucket,
      Key: input.physicalKey,
      ContentType: input.contentType,
      // Signed, so it becomes part of the signature the endpoint verifies: a
      // client cannot widen the URL into an unbounded upload.
      ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
    });

    const url = await this.guard(
      () =>
        getSignedUrl(this.client, command, {
          expiresIn: input.expiresInSeconds,
          ...(input.contentLength === undefined
            ? {}
            : { signableHeaders: new Set(['content-length']) }),
        }),
      'Upload URL could not be generated',
    );

    return {
      url,
      method: 'PUT',
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      headers: {
        ...(input.contentType ? { 'content-type': input.contentType } : {}),
        ...(input.contentLength === undefined
          ? {}
          : { 'content-length': String(input.contentLength) }),
      },
    };
  }

  // --- health ------------------------------------------------------------

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await this.client.send(new ListBucketsCommand({}));
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'S3 endpoint unreachable',
      };
    }
  }

  /**
   * Runs an SDK call and replaces any AWS/MinIO error with a stable VaultStack
   * error, so vendor error shapes never reach an API response.
   */
  private async guard<T>(operation: () => Promise<T>, message: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isAppError(error)) {
        throw error;
      }
      if (isNotFoundError(error)) {
        throw storageObjectNotFound();
      }
      throw storageProviderUnavailable(message);
    }
  }
}

function isAppError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AppError';
}

function isNotFoundError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;

  return name === 'NoSuchKey' || name === 'NotFound' || name === 'NoSuchBucket' || status === 404;
}

/** Strips characters that would break a Content-Disposition header. */
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
}
