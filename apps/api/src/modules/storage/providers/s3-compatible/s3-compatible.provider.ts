import type { IncomingMessage } from 'node:http';
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
  ListPartsCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { STORAGE_PROVIDER_TYPES, type StorageProviderTypeName } from '@vaultstack/types';
import {
  storageBucketNotFound,
  storageObjectNotFound,
  storageObjectTooLarge,
  storageProviderUnavailable,
  storageUploadFailed,
} from '../../../../lib/errors.js';
import { IntegrityMeter, ObjectTooLargeError, normalizeEtag } from '../../domain/integrity.js';
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
  CapacityCheckInput,
  CapacityCheckResult,
  InitiateMultipartInput,
  InitiateMultipartResult,
  InspectPartInput,
  ListObjectsInput,
  ListProviderPartsInput,
  PresignedPartUrlInput,
  PresignedUrl,
  PresignedUrlInput,
  ProviderBucketRef,
  ProviderBucketSummary,
  ProviderHealth,
  ProviderObjectListPage,
  ProviderPartInfo,
  PutObjectInput,
  PutObjectResult,
  StorageLocation,
  UploadPartInput,
  UploadPartResult,
} from '../../domain/storage.types.js';

export interface S3CompatibleProviderOptions {
  client: S3Client;
  region: string;
  /**
   * When false, CreateBucket is sent without a LocationConstraint. Dialects
   * whose region tokens are not AWS location codes (for example R2 `auto`)
   * must set this.
   */
  sendCreateBucketLocationConstraint?: boolean;
  /**
   * When false, deleteBucket is a no-op. Used when the organization supplied a
   * shared physical bucket that VaultStack must not destroy.
   */
  ownsPhysicalBuckets?: boolean;
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
    directPartDestinations: true,
    providerPartInspection: true,
    capacityChecks: false,
  };

  private readonly client: S3Client;
  private readonly region: string;
  private readonly sendCreateBucketLocationConstraint: boolean;
  private readonly ownsPhysicalBuckets: boolean;

  constructor(options: S3CompatibleProviderOptions) {
    this.client = options.client;
    this.region = options.region;
    this.sendCreateBucketLocationConstraint = options.sendCreateBucketLocationConstraint ?? true;
    this.ownsPhysicalBuckets = options.ownsPhysicalBuckets ?? true;
  }

  // --- buckets -----------------------------------------------------------

  async createBucket(ref: ProviderBucketRef): Promise<void> {
    await this.guard(async () => {
      try {
        await this.client.send(
          new CreateBucketCommand({
            Bucket: ref.physicalBucket,
            ...(this.shouldSendLocationConstraint()
              ? { CreateBucketConfiguration: { LocationConstraint: this.region as never } }
              : {}),
          }),
        );
      } catch (error) {
        if (isBucketAlreadyExistsError(error)) {
          return;
        }
        throw error;
      }
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
    if (!this.ownsPhysicalBuckets) {
      return;
    }

    await this.guard(
      () => this.client.send(new DeleteBucketCommand({ Bucket: ref.physicalBucket })),
      'Bucket could not be deleted',
    );
  }

  // --- objects -----------------------------------------------------------

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    // The meter enforces the size ceiling and produces the checksum while the
    // body streams to the endpoint, so large objects are never buffered.
    const contentType = input.contentType ?? 'application/octet-stream';
    const contentLength = contentLengthOf(input.body, input.expect?.size);
    const { meter, result: response } = await this.sendMetered(
      input.body,
      input.maxSizeBytes,
      (body) => {
        const params = {
          Bucket: input.physicalBucket,
          Key: input.physicalKey,
          Body: body,
          ContentType: contentType,
          Metadata: input.metadata,
          ...(contentLength === undefined ? {} : { ContentLength: contentLength }),
        };

        if (contentLength !== undefined) {
          return this.client.send(new PutObjectCommand(params), { abortSignal: input.signal });
        }

        // AWS SDK v3 refuses unknown-length streams on PutObject. Upload
        // switches to multipart so MinIO and other S3-compatible endpoints
        // still receive a well-formed request.
        const upload = new Upload({ client: this.client, params });
        if (input.signal) {
          const abort = (): void => {
            void upload.abort();
          };
          input.signal.addEventListener('abort', abort, { once: true });
        }
        return upload.done();
      },
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
    const response = await this.guard(async () => {
      try {
        return await this.client.send(
          new ListObjectsV2Command({
            Bucket: input.physicalBucket,
            Prefix: input.prefix,
            Delimiter: input.delimiter,
            MaxKeys: input.maxKeys,
            ContinuationToken: input.cursor,
          }),
        );
      } catch (error) {
        if (isNoSuchBucketError(error)) {
          throw storageBucketNotFound();
        }
        throw error;
      }
    }, 'Objects could not be listed');

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
    const contentLength = contentLengthOf(input.body);
    const { meter, result: response } = await this.sendMetered(
      input.body,
      input.maxSizeBytes,
      async (body) => {
        const payload = contentLength === undefined ? await collectStream(body) : body;
        const length = Buffer.isBuffer(payload) ? payload.length : contentLength;
        return this.client.send(
          new UploadPartCommand({
            Bucket: input.physicalBucket,
            Key: input.physicalKey,
            UploadId: input.providerUploadId,
            PartNumber: input.partNumber,
            Body: payload,
            ...(length === undefined ? {} : { ContentLength: length }),
          }),
          { abortSignal: input.signal },
        );
      },
      'Part upload failed',
    );

    const totals = meter.totals();

    return {
      partNumber: input.partNumber,
      size: totals.size,
      etag: normalizeEtag(response.ETag ?? totals.md5),
      checksum: totals.sha256,
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

  async inspectPart(input: InspectPartInput): Promise<ProviderPartInfo | null> {
    const parts = await this.listProviderParts(input);
    return parts.find((part) => part.partNumber === input.partNumber) ?? null;
  }

  async listProviderParts(input: ListProviderPartsInput): Promise<ProviderPartInfo[]> {
    const collected: ProviderPartInfo[] = [];
    let marker: string | undefined;

    for (;;) {
      const response = await this.guard(
        () =>
          this.client.send(
            new ListPartsCommand({
              Bucket: input.physicalBucket,
              Key: input.physicalKey,
              UploadId: input.providerUploadId,
              PartNumberMarker: marker,
            }),
          ),
        'Multipart parts could not be listed',
      );

      for (const part of response.Parts ?? []) {
        if (part.PartNumber === undefined) {
          continue;
        }
        collected.push({
          partNumber: part.PartNumber,
          size: part.Size ?? 0,
          etag: normalizeEtag(part.ETag ?? ''),
          ...(part.ChecksumSHA256 ? { checksumSha256: part.ChecksumSHA256 } : {}),
        });
      }

      if (!response.IsTruncated || response.NextPartNumberMarker === undefined) {
        break;
      }
      marker = response.NextPartNumberMarker;
    }

    return collected;
  }

  async createPresignedPartUrl(input: PresignedPartUrlInput): Promise<PresignedUrl> {
    const checksumSha256 = input.checksumSha256
      ? Buffer.from(input.checksumSha256, 'hex').toString('base64')
      : undefined;
    const command = new UploadPartCommand({
      Bucket: input.physicalBucket,
      Key: input.physicalKey,
      UploadId: input.providerUploadId,
      PartNumber: input.partNumber,
      ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
      ...(checksumSha256 ? { ChecksumSHA256: checksumSha256 } : {}),
    });

    const signableHeaders = new Set<string>();
    if (input.contentLength !== undefined) {
      signableHeaders.add('content-length');
    }
    if (checksumSha256) {
      signableHeaders.add('x-amz-checksum-sha256');
    }

    const url = await this.guard(
      () =>
        getSignedUrl(this.client, command, {
          expiresIn: input.expiresInSeconds,
          ...(signableHeaders.size > 0 ? { signableHeaders } : {}),
        }),
      'Part upload URL could not be generated',
    );

    return {
      url,
      method: 'PUT',
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      headers: {
        ...(input.contentLength === undefined
          ? {}
          : { 'content-length': String(input.contentLength) }),
        ...(checksumSha256 ? { 'x-amz-checksum-sha256': checksumSha256 } : {}),
      },
    };
  }

  checkCapacity(_input: CapacityCheckInput): Promise<CapacityCheckResult> {
    return Promise.resolve({ ok: true });
  }

  cleanupOrphanStaging(_olderThan: Date): Promise<number> {
    return Promise.resolve(0);
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
    } catch {
      return { ok: false, message: 'S3 endpoint unreachable' };
    }
  }

  private shouldSendLocationConstraint(): boolean {
    return (
      this.sendCreateBucketLocationConstraint && Boolean(this.region) && this.region !== 'us-east-1'
    );
  }

  /**
   * Streams `source` through an integrity meter into an SDK call. Size-ceiling
   * failures are raised as STORAGE_OBJECT_TOO_LARGE instead of an unhandled
   * stream error after the AWS client detaches.
   */
  private async sendMetered<T>(
    source: Readable,
    maxSizeBytes: number,
    send: (body: Readable) => Promise<T>,
    message: string,
  ): Promise<{ result: T; meter: IntegrityMeter }> {
    const meter = new IntegrityMeter(maxSizeBytes);
    let rejectPending: ((error: unknown) => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      rejectPending = reject;
    });

    meter.on('error', (error: Error) => {
      source.unpipe(meter);
      if (!source.destroyed) {
        source.destroy();
      }
      rejectPending?.(error);
    });

    const sendPromise = send(source.pipe(meter));

    try {
      const result = await this.guard(() => Promise.race([sendPromise, aborted]), message);
      rejectPending = undefined;
      return { result, meter };
    } catch (error) {
      rejectPending = undefined;
      void sendPromise.catch(() => undefined);
      throw error;
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
      const tooLarge = findObjectTooLarge(error);
      if (tooLarge) {
        throw storageObjectTooLarge(tooLarge.maxSizeBytes);
      }
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

function findObjectTooLarge(error: unknown): ObjectTooLargeError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8; depth += 1) {
    if (current instanceof ObjectTooLargeError) {
      return current;
    }
    if (!(current instanceof Error)) {
      return undefined;
    }
    current = current.cause;
  }
  return undefined;
}

function contentLengthOf(body: Readable, expected?: number): number | undefined {
  if (expected !== undefined) {
    return expected;
  }

  const header = (body as IncomingMessage).headers['content-length'];
  if (typeof header === 'string' && header.length > 0) {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
}

async function collectStream(source: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of source) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function isNoSuchBucketError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'NoSuchBucket';
}

function isAppError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AppError';
}

function isBucketAlreadyExistsError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;

  return name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists' || status === 409;
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
