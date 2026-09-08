import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { STORAGE_PROVIDER_TYPES, type StorageProviderTypeName } from '@vaultstack/types';
import {
  storageChecksumMismatch,
  storageNotImplemented,
  storageObjectNotFound,
  storageObjectTooLarge,
  storageProviderUnavailable,
  storageSizeMismatch,
  storageUploadFailed,
  type AppError,
} from '../../../../lib/errors.js';
import {
  IntegrityMeter,
  ObjectTooLargeError,
  multipartEtag,
  singlePartEtag,
  type IntegrityTotals,
} from '../../domain/integrity.js';
import type {
  StorageProvider,
  StorageProviderCapabilities,
} from '../../domain/storage-provider.js';
import type {
  AbortMultipartInput,
  CapacityCheckInput,
  CapacityCheckResult,
  CompleteMultipartInput,
  CopyObjectInput,
  GetObjectInput,
  GetObjectResult,
  HeadObjectResult,
  InitiateMultipartInput,
  InitiateMultipartResult,
  InspectPartInput,
  IntegrityExpectation,
  ListObjectsInput,
  ListProviderPartsInput,
  PresignedPartUrlInput,
  PresignedUrl,
  PresignedUrlInput,
  ProviderBucketRef,
  ProviderBucketSummary,
  ProviderHealth,
  ProviderObjectListPage,
  ProviderObjectSummary,
  ProviderPartInfo,
  PutObjectInput,
  PutObjectResult,
  StorageLocation,
  UploadPartInput,
  UploadPartResult,
} from '../../domain/storage.types.js';
import { commonPrefixOf } from '../../domain/object-key.js';
import {
  assertRealPathWithinRoot,
  isDiskFull,
  isNotFound,
  isPermissionDenied,
  resolveWithinRoot,
} from './safe-path.js';

/**
 * Physical layout under the configured storage root:
 *
 *   objects/<physical-bucket>/<physical-key>/data
 *   objects/<physical-bucket>/<physical-key>/metadata.json
 *   multipart/<provider-upload-id>/<part-number>
 *   temp/<random>                  staging for in-flight writes
 *   trash/                         reserved for deferred deletion
 *
 * `physical-bucket` and `physical-key` are both server-generated, so no
 * user-controlled string ever contributes to a path.
 */
const OBJECTS_DIR = 'objects';
const MULTIPART_DIR = 'multipart';
const TEMP_DIR = 'temp';
const TRASH_DIR = 'trash';

const DATA_FILE = 'data';
const METADATA_FILE = 'metadata.json';

interface StoredMetadata {
  contentType: string;
  etag: string;
  md5: string;
  sha256: string;
  size: number;
  metadata?: Record<string, string>;
  createdAt: string;
}

export interface LocalFilesystemProviderOptions {
  root: string;
}

export function createLocalFilesystemProvider(
  options: LocalFilesystemProviderOptions,
): StorageProvider {
  return new LocalFilesystemStorageProvider(options);
}

export class LocalFilesystemStorageProvider implements StorageProvider {
  readonly type: StorageProviderTypeName = STORAGE_PROVIDER_TYPES.LOCAL_FILESYSTEM;

  readonly capabilities: StorageProviderCapabilities = {
    // Downloads are streamed through the authenticated API instead of handing
    // the browser a signed URL, so no storage credential ever leaves the server.
    nativePresignedUrls: false,
    nativeVersioning: false,
    serverSideCopy: false,
    directPartDestinations: false,
    providerPartInspection: true,
    capacityChecks: true,
  };

  private readonly root: string;

  constructor(options: LocalFilesystemProviderOptions) {
    this.root = options.root;
  }

  // --- layout helpers ----------------------------------------------------

  private bucketPath(physicalBucket: string): string {
    return resolveWithinRoot(this.root, OBJECTS_DIR, physicalBucket);
  }

  private objectDir(location: StorageLocation): string {
    return resolveWithinRoot(this.root, OBJECTS_DIR, location.physicalBucket, location.physicalKey);
  }

  private multipartDir(providerUploadId: string): string {
    return resolveWithinRoot(this.root, MULTIPART_DIR, providerUploadId);
  }

  private async ensureLayout(): Promise<void> {
    for (const dir of [OBJECTS_DIR, MULTIPART_DIR, TEMP_DIR, TRASH_DIR]) {
      await mkdir(resolveWithinRoot(this.root, dir), { recursive: true });
    }
  }

  // --- buckets -----------------------------------------------------------

  async createBucket(ref: ProviderBucketRef): Promise<void> {
    await this.ensureLayout();
    const path = this.bucketPath(ref.physicalBucket);
    await assertRealPathWithinRoot(this.root, path);
    await this.guardFsErrors(() => mkdir(path, { recursive: true }));
  }

  async listBuckets(): Promise<ProviderBucketSummary[]> {
    await this.ensureLayout();
    const base = resolveWithinRoot(this.root, OBJECTS_DIR);

    const entries = await this.guardFsErrors(() => readdir(base, { withFileTypes: true }));

    const summaries: ProviderBucketSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const stats = await stat(join(base, entry.name)).catch(() => null);
      summaries.push({
        physicalBucket: entry.name,
        createdAt: stats?.birthtime ?? null,
      });
    }

    return summaries;
  }

  async getBucket(ref: ProviderBucketRef): Promise<ProviderBucketSummary | null> {
    const path = this.bucketPath(ref.physicalBucket);
    const stats = await stat(path).catch((error: unknown) => {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    });

    if (!stats?.isDirectory()) {
      return null;
    }

    return { physicalBucket: ref.physicalBucket, createdAt: stats.birthtime };
  }

  async deleteBucket(ref: ProviderBucketRef): Promise<void> {
    const path = this.bucketPath(ref.physicalBucket);
    await assertRealPathWithinRoot(this.root, path);
    await this.guardFsErrors(() => rm(path, { recursive: true, force: true }));
  }

  // --- objects -----------------------------------------------------------

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    await this.ensureLayout();

    const targetDir = this.objectDir(input);
    const tempPath = resolveWithinRoot(this.root, TEMP_DIR, `${randomUUID()}.part`);
    await assertRealPathWithinRoot(this.root, tempPath);

    const meter = new IntegrityMeter(input.maxSizeBytes);

    try {
      // Streams straight to disk with backpressure; nothing is accumulated.
      await pipeline(input.body, meter, createWriteStream(tempPath), {
        signal: input.signal,
      });
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw this.translateFsError(error);
    }

    const totals = meter.totals();

    // Integrity is verified while the bytes are still staged, so a corrupted
    // upload is never published as a readable object.
    const mismatch = detectIntegrityMismatch(totals, input.expect);
    if (mismatch) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw mismatch;
    }

    const contentType = input.contentType ?? 'application/octet-stream';
    const etag = singlePartEtag(totals.md5);

    try {
      await mkdir(targetDir, { recursive: true });
      await assertRealPathWithinRoot(this.root, targetDir);

      // rename is atomic within the volume, so a reader never sees a partial
      // object: the data file appears complete or not at all.
      await rename(tempPath, join(targetDir, DATA_FILE));
      await this.writeMetadata(targetDir, {
        contentType,
        etag,
        md5: totals.md5,
        sha256: totals.sha256,
        size: totals.size,
        metadata: input.metadata,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw this.translateFsError(error);
    }

    return {
      size: totals.size,
      etag,
      checksum: { algorithm: 'SHA256', value: totals.sha256 },
      contentType,
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const dir = this.objectDir(input);
    const dataPath = join(dir, DATA_FILE);

    const [stats, metadata] = await Promise.all([
      stat(dataPath).catch((error: unknown) => {
        if (isNotFound(error)) {
          return null;
        }
        throw this.translateFsError(error);
      }),
      this.readMetadata(dir),
    ]);

    if (!stats) {
      throw storageObjectNotFound();
    }

    const size = stats.size;
    let start = 0;
    let end = size - 1;
    let contentRange: string | undefined;

    if (input.range) {
      start = Math.max(0, input.range.start);
      end = input.range.end === undefined ? size - 1 : Math.min(input.range.end, size - 1);

      if (start > end || start >= size) {
        throw storageObjectNotFound();
      }

      contentRange = `bytes ${start}-${end}/${size}`;
    }

    const body = createReadStream(dataPath, { start, end });
    if (input.signal) {
      const onAbort = (): void => {
        body.destroy();
      };
      input.signal.addEventListener('abort', onAbort, { once: true });
      body.once('close', () => input.signal?.removeEventListener('abort', onAbort));
    }

    return {
      body,
      size: contentRange ? end - start + 1 : size,
      contentType: metadata?.contentType ?? 'application/octet-stream',
      etag: metadata?.etag ?? '',
      lastModified: stats.mtime,
      contentRange,
    };
  }

  async headObject(location: StorageLocation): Promise<HeadObjectResult | null> {
    const dir = this.objectDir(location);

    const stats = await stat(join(dir, DATA_FILE)).catch((error: unknown) => {
      if (isNotFound(error)) {
        return null;
      }
      throw this.translateFsError(error);
    });

    if (!stats) {
      return null;
    }

    const metadata = await this.readMetadata(dir);

    return {
      size: stats.size,
      contentType: metadata?.contentType ?? 'application/octet-stream',
      etag: metadata?.etag ?? '',
      lastModified: stats.mtime,
      metadata: metadata?.metadata,
    };
  }

  async deleteObject(location: StorageLocation): Promise<void> {
    const dir = this.objectDir(location);
    await assertRealPathWithinRoot(this.root, dir);
    await this.guardFsErrors(() => rm(dir, { recursive: true, force: true }));
  }

  async copyObject(input: CopyObjectInput): Promise<PutObjectResult> {
    const source = await this.getObject(input.source);

    return this.putObject({
      ...input.destination,
      body: source.body,
      contentType: input.contentType ?? source.contentType,
      metadata: input.metadata,
      // The source already passed the size ceiling when it was written.
      maxSizeBytes: Number.MAX_SAFE_INTEGER,
    });
  }

  async listObjects(input: ListObjectsInput): Promise<ProviderObjectListPage> {
    const bucketPath = this.bucketPath(input.physicalBucket);
    const prefix = input.prefix ?? '';
    const cursor = input.cursor;

    const discovered = await this.walkObjects(bucketPath, '');

    const matching = discovered
      .filter((item) => item.physicalKey.startsWith(prefix))
      .filter((item) => (cursor ? item.physicalKey > cursor : true))
      .sort((left, right) => (left.physicalKey < right.physicalKey ? -1 : 1));

    // Collapses keys that share a folder into CommonPrefixes, the way S3 does
    // when a delimiter is supplied.
    const prefixes = new Set<string>();
    const objects: ProviderObjectSummary[] = [];

    for (const item of matching) {
      const commonPrefix = input.delimiter
        ? commonPrefixOf(item.physicalKey, prefix, input.delimiter)
        : null;

      if (commonPrefix) {
        prefixes.add(commonPrefix);
      } else {
        objects.push(item);
      }

      if (objects.length + prefixes.size >= input.maxKeys) {
        break;
      }
    }

    const consumed = objects.length + prefixes.size;
    const isTruncated = consumed < matching.length;

    return {
      objects,
      prefixes: [...prefixes].sort(),
      nextCursor: isTruncated ? (objects.at(-1)?.physicalKey ?? null) : null,
      isTruncated,
    };
  }

  // --- multipart ---------------------------------------------------------

  async initiateMultipartUpload(input: InitiateMultipartInput): Promise<InitiateMultipartResult> {
    await this.ensureLayout();

    const providerUploadId = randomUUID();
    const dir = this.multipartDir(providerUploadId);
    await assertRealPathWithinRoot(this.root, dir);
    await this.guardFsErrors(() => mkdir(dir, { recursive: true }));

    // Records the destination so completion cannot be redirected by a client.
    await writeFile(
      join(dir, 'upload.json'),
      JSON.stringify({
        physicalBucket: input.physicalBucket,
        physicalKey: input.physicalKey,
        contentType: input.contentType ?? null,
        metadata: input.metadata ?? null,
      }),
      'utf8',
    );

    return { providerUploadId };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadPartResult> {
    const dir = this.multipartDir(input.providerUploadId);

    const exists = await stat(dir).catch(() => null);
    if (!exists) {
      throw storageObjectNotFound();
    }

    const partPath = join(dir, `${String(input.partNumber).padStart(5, '0')}.part`);
    const tempPath = resolveWithinRoot(this.root, TEMP_DIR, `${randomUUID()}.part`);
    const meter = new IntegrityMeter(input.maxSizeBytes);

    try {
      await pipeline(input.body, meter, createWriteStream(tempPath), {
        signal: input.signal,
      });
      await rename(tempPath, partPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw this.translateFsError(error);
    }

    const totals = meter.totals();
    await writeFile(`${partPath}.md5`, totals.md5, 'utf8');
    await writeFile(`${partPath}.sha256`, totals.sha256, 'utf8');

    return {
      partNumber: input.partNumber,
      size: totals.size,
      etag: totals.md5,
      checksum: totals.sha256,
    };
  }

  async inspectPart(input: InspectPartInput): Promise<ProviderPartInfo | null> {
    const dir = this.multipartDir(input.providerUploadId);
    const partPath = join(dir, `${String(input.partNumber).padStart(5, '0')}.part`);
    const stats = await stat(partPath).catch(() => null);
    if (!stats) {
      return null;
    }

    const [etag, checksumSha256] = await Promise.all([
      readFile(`${partPath}.md5`, 'utf8').catch(() => ''),
      readFile(`${partPath}.sha256`, 'utf8').catch(() => undefined),
    ]);

    return {
      partNumber: input.partNumber,
      size: stats.size,
      etag,
      ...(checksumSha256 ? { checksumSha256 } : {}),
    };
  }

  async listProviderParts(input: ListProviderPartsInput): Promise<ProviderPartInfo[]> {
    const dir = this.multipartDir(input.providerUploadId);
    const entries = await readdir(dir).catch(() => []);
    const parts: ProviderPartInfo[] = [];

    for (const entry of entries) {
      const match = /^(\d{5})\.part$/.exec(entry);
      if (!match) {
        continue;
      }
      const inspected = await this.inspectPart({
        ...input,
        partNumber: Number(match[1]),
      });
      if (inspected) {
        parts.push(inspected);
      }
    }

    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  async createPresignedPartUrl(_input: PresignedPartUrlInput): Promise<PresignedUrl> {
    await Promise.resolve();
    throw storageProviderUnavailable(
      'Local filesystem provider does not issue provider-native part destinations',
    );
  }

  async checkCapacity(input: CapacityCheckInput): Promise<CapacityCheckResult> {
    await this.ensureLayout();
    const stats = await statfs(this.root);
    const availableBytes = stats.bavail * stats.bsize;
    return {
      ok: availableBytes >= input.requiredBytes,
      availableBytes,
    };
  }

  async completeMultipartUpload(input: CompleteMultipartInput): Promise<PutObjectResult> {
    const dir = this.multipartDir(input.providerUploadId);
    const targetDir = this.objectDir(input);
    const tempPath = resolveWithinRoot(this.root, TEMP_DIR, `${randomUUID()}.part`);

    const ordered = [...input.parts].sort((left, right) => left.partNumber - right.partNumber);
    const partMd5s: string[] = [];

    try {
      // Concatenates parts by streaming each one in turn, so peak memory stays
      // at one chunk regardless of the assembled object size.
      const writable = createWriteStream(tempPath);
      const sha256Meter = new IntegrityMeter(Number.MAX_SAFE_INTEGER);
      sha256Meter.pipe(writable);

      for (const part of ordered) {
        const partPath = join(dir, `${String(part.partNumber).padStart(5, '0')}.part`);
        const stats = await stat(partPath).catch(() => null);
        if (!stats) {
          throw storageObjectNotFound();
        }

        const md5 = await readFile(`${partPath}.md5`, 'utf8').catch(() => null);
        if (!md5) {
          throw storageObjectNotFound();
        }
        partMd5s.push(md5);

        await new Promise<void>((resolvePart, rejectPart) => {
          const source = createReadStream(partPath);
          source.on('error', rejectPart);
          source.on('end', resolvePart);
          source.pipe(sha256Meter, { end: false });
        });
      }

      await new Promise<void>((resolveEnd, rejectEnd) => {
        writable.on('error', rejectEnd);
        writable.on('finish', resolveEnd);
        sha256Meter.end();
      });

      const totals = sha256Meter.totals();
      const etag = multipartEtag(partMd5s);
      const contentType = input.contentType ?? 'application/octet-stream';

      await mkdir(targetDir, { recursive: true });
      await assertRealPathWithinRoot(this.root, targetDir);
      await rename(tempPath, join(targetDir, DATA_FILE));
      await this.writeMetadata(targetDir, {
        contentType,
        etag,
        md5: totals.md5,
        sha256: totals.sha256,
        size: totals.size,
        createdAt: new Date().toISOString(),
      });

      await rm(dir, { recursive: true, force: true }).catch(() => undefined);

      return {
        size: totals.size,
        etag,
        checksum: { algorithm: 'SHA256', value: totals.sha256 },
        contentType,
      };
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw this.translateFsError(error);
    }
  }

  async abortMultipartUpload(input: AbortMultipartInput): Promise<void> {
    const dir = this.multipartDir(input.providerUploadId);
    await assertRealPathWithinRoot(this.root, dir);
    await this.guardFsErrors(() => rm(dir, { recursive: true, force: true }));
  }

  // --- presigned URLs ----------------------------------------------------

  async createPresignedDownloadUrl(_input: PresignedUrlInput): Promise<PresignedUrl> {
    // The local provider has no signing endpoint of its own. The storage
    // service issues a short-lived VaultStack-signed URL instead, which is why
    // capabilities.nativePresignedUrls is false.
    await Promise.resolve();
    throw storageProviderUnavailable(
      'Local filesystem provider does not issue provider-native presigned URLs',
    );
  }

  async createPresignedUploadUrl(_input: PresignedUrlInput): Promise<PresignedUrl> {
    await Promise.resolve();
    throw storageProviderUnavailable(
      'Local filesystem provider does not issue provider-native presigned URLs',
    );
  }

  // --- health ------------------------------------------------------------

  async healthCheck(): Promise<ProviderHealth> {
    try {
      await this.ensureLayout();
      const probe = resolveWithinRoot(this.root, TEMP_DIR, `${randomUUID()}.probe`);
      await writeFile(probe, 'ok', 'utf8');
      await rm(probe, { force: true });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Storage root is not writable',
      };
    }
  }

  async cleanupOrphanStaging(olderThan: Date): Promise<number> {
    return this.cleanupStaleStaging(olderThan);
  }

  /** Removes staged parts and temp files older than the supplied cutoff. */
  async cleanupStaleStaging(olderThan: Date): Promise<number> {
    await this.ensureLayout();
    let removed = 0;

    for (const dir of [TEMP_DIR, MULTIPART_DIR]) {
      const base = resolveWithinRoot(this.root, dir);
      const entries = await readdir(base, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        const path = join(base, entry.name);
        const stats = await stat(path).catch(() => null);
        if (!stats || stats.mtime >= olderThan) {
          continue;
        }
        await rm(path, { recursive: true, force: true }).catch(() => undefined);
        removed += 1;
      }
    }

    return removed;
  }

  // --- internals ---------------------------------------------------------

  /**
   * Walks the fan-out layout looking for directories that contain a data file.
   * Discovering objects structurally keeps listing correct even if the physical
   * key layout changes.
   */
  private async walkObjects(
    base: string,
    relative: string,
    depth = 0,
  ): Promise<ProviderObjectSummary[]> {
    if (depth > 4) {
      return [];
    }

    const current = relative ? join(base, relative) : base;
    const entries = await readdir(current, { withFileTypes: true }).catch((error: unknown) => {
      if (isNotFound(error)) {
        return [];
      }
      throw this.translateFsError(error);
    });

    if (entries.some((entry) => entry.isFile() && entry.name === DATA_FILE)) {
      const stats = await stat(join(current, DATA_FILE)).catch(() => null);
      if (stats) {
        const metadata = await this.readMetadata(current);
        return [
          {
            physicalKey: relative.split(/[/\\]/).join(posix.sep),
            size: stats.size,
            etag: metadata?.etag ?? '',
            lastModified: stats.mtime,
          },
        ];
      }
    }

    const results: ProviderObjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const child = relative ? join(relative, entry.name) : entry.name;
      results.push(...(await this.walkObjects(base, child, depth + 1)));
    }

    return results;
  }

  private async writeMetadata(dir: string, metadata: StoredMetadata): Promise<void> {
    await writeFile(join(dir, METADATA_FILE), JSON.stringify(metadata), 'utf8');
  }

  private async readMetadata(dir: string): Promise<StoredMetadata | null> {
    const raw = await readFile(join(dir, METADATA_FILE), 'utf8').catch(() => null);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as StoredMetadata;
    } catch {
      return null;
    }
  }

  private async guardFsErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.translateFsError(error);
    }
  }

  /**
   * Converts raw filesystem and stream errors into stable VaultStack errors so
   * that errno codes and absolute paths never reach an API response.
   */
  private translateFsError(error: unknown): unknown {
    if (error instanceof ObjectTooLargeError) {
      return storageObjectTooLarge(error.maxSizeBytes);
    }

    if (isAbortError(error)) {
      return storageUploadFailed('Upload was aborted before it completed');
    }

    if (isDiskFull(error)) {
      return storageProviderUnavailable('Storage volume is full');
    }

    if (isPermissionDenied(error)) {
      return storageProviderUnavailable('Storage volume is not writable');
    }

    return error;
  }
}

/**
 * Compares measured totals against what the caller promised.
 *
 * Returns the error to raise rather than throwing, so the caller can clean up
 * the staged file first.
 */
function detectIntegrityMismatch(
  totals: IntegrityTotals,
  expectation: IntegrityExpectation | undefined,
): AppError | null {
  if (!expectation) {
    return null;
  }

  if (expectation.size !== undefined && expectation.size !== totals.size) {
    return storageSizeMismatch();
  }

  const checksum = expectation.checksum;
  if (!checksum || checksum.algorithm === 'NONE') {
    return null;
  }

  const actual =
    checksum.algorithm === 'SHA256'
      ? totals.sha256
      : checksum.algorithm === 'MD5'
        ? totals.md5
        : null;

  if (actual === null) {
    // CRC32 is not computed by the integrity meter; refusing is safer than
    // accepting an unverified upload that claimed to be checksummed.
    return storageNotImplemented(`Checksum algorithm ${checksum.algorithm} is not supported`);
  }

  return actual.toLowerCase() === checksum.value.toLowerCase() ? null : storageChecksumMismatch();
}

function isAbortError(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string } | null;
  return candidate?.name === 'AbortError' || candidate?.code === 'ABORT_ERR';
}

/** Builds the physical key for an object. Exposed for tests and documentation. */
export function physicalObjectKey(objectId: string): string {
  // A two-character fan-out keeps directory sizes manageable on ext4/xfs.
  return posix.join(objectId.slice(0, 2), objectId);
}
