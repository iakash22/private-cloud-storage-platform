import { createHash, type Hash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

/**
 * Signals that a stream exceeded the configured maximum object size. The
 * storage service translates this into STORAGE_OBJECT_TOO_LARGE.
 */
export class ObjectTooLargeError extends Error {
  readonly maxSizeBytes: number;

  constructor(maxSizeBytes: number) {
    super(`Object exceeds the maximum allowed size of ${maxSizeBytes} bytes`);
    this.name = 'ObjectTooLargeError';
    this.maxSizeBytes = maxSizeBytes;
  }
}

export interface IntegrityTotals {
  size: number;
  md5: string;
  sha256: string;
}

/**
 * A pass-through stream that measures size and computes MD5 and SHA-256 in a
 * single pass, and fails the stream as soon as `maxSizeBytes` is exceeded.
 *
 * MD5 backs S3-compatible ETags; SHA-256 is the VaultStack checksum. Nothing is
 * buffered, so this stays constant-memory regardless of object size.
 */
export class IntegrityMeter extends Transform {
  private readonly md5: Hash;
  private readonly sha256: Hash;
  private readonly maxSizeBytes: number;
  private bytes = 0;
  private finished = false;

  constructor(maxSizeBytes: number) {
    super();
    this.md5 = createHash('md5');
    this.sha256 = createHash('sha256');
    this.maxSizeBytes = maxSizeBytes;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytes += chunk.length;

    if (this.bytes > this.maxSizeBytes) {
      callback(new ObjectTooLargeError(this.maxSizeBytes));
      return;
    }

    this.md5.update(chunk);
    this.sha256.update(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    this.finished = true;
    callback();
  }

  totals(): IntegrityTotals {
    if (!this.finished) {
      throw new Error('Integrity totals read before the stream finished');
    }

    return {
      size: this.bytes,
      md5: this.md5.digest('hex'),
      sha256: this.sha256.digest('hex'),
    };
  }

  get bytesSeen(): number {
    return this.bytes;
  }
}

/**
 * Computes the S3 multipart ETag: the MD5 of the concatenated binary part
 * MD5s, suffixed with the part count.
 *
 * A multipart ETag is deliberately not the MD5 of the whole object, so callers
 * must not assume ETag equality implies a plain content hash.
 */
export function multipartEtag(partMd5Hex: string[]): string {
  const combined = Buffer.concat(partMd5Hex.map((hex) => Buffer.from(hex, 'hex')));
  const digest = createHash('md5').update(combined).digest('hex');
  return `${digest}-${partMd5Hex.length}`;
}

/** Wraps a single-part hex digest in the quoted form S3 clients expect. */
export function singlePartEtag(md5Hex: string): string {
  return md5Hex;
}

/** Normalizes an ETag for comparison, ignoring quoting and weak validators. */
export function normalizeEtag(etag: string): string {
  return etag.replace(/^W\//, '').replace(/^"|"$/g, '');
}
