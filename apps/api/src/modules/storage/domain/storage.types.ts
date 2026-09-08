import type { Readable } from 'node:stream';
import type { StorageProviderTypeName } from '@vaultstack/types';

/**
 * Physical addressing used between the storage service and a storage provider.
 *
 * Both fields are always server-generated. User-controlled object keys never
 * reach a provider: the service layer resolves them to a physical location
 * first, which is what keeps object keys from influencing filesystem paths.
 */
export interface StorageLocation {
  physicalBucket: string;
  physicalKey: string;
}

export interface ProviderBucketRef {
  physicalBucket: string;
  region?: string | null;
}

export interface ProviderBucketSummary {
  physicalBucket: string;
  createdAt: Date | null;
}

export type ChecksumAlgorithmName = 'NONE' | 'MD5' | 'SHA256' | 'CRC32';

export interface ObjectChecksum {
  algorithm: ChecksumAlgorithmName;
  value: string;
}

/** Caller-supplied expectations verified while the body streams through. */
export interface IntegrityExpectation {
  size?: number;
  checksum?: ObjectChecksum;
}

export interface PutObjectInput extends StorageLocation {
  body: Readable;
  contentType?: string;
  metadata?: Record<string, string>;
  /** Hard ceiling; the stream is aborted once exceeded. */
  maxSizeBytes: number;
  expect?: IntegrityExpectation;
  /** Aborts an in-flight write, e.g. on client disconnect. */
  signal?: AbortSignal;
}

export interface PutObjectResult {
  size: number;
  etag: string;
  checksum: ObjectChecksum;
  contentType: string;
}

export interface ByteRange {
  start: number;
  end?: number;
}

export interface GetObjectInput extends StorageLocation {
  range?: ByteRange;
  signal?: AbortSignal;
}

export interface GetObjectResult {
  body: Readable;
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  /** Present only when a range was requested. */
  contentRange?: string;
}

export interface HeadObjectResult {
  size: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export interface CopyObjectInput {
  source: StorageLocation;
  destination: StorageLocation;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface ListObjectsInput {
  physicalBucket: string;
  prefix?: string;
  delimiter?: string;
  maxKeys: number;
  cursor?: string;
}

export interface ProviderObjectSummary {
  physicalKey: string;
  size: number;
  etag: string;
  lastModified: Date;
}

export interface ProviderObjectListPage {
  objects: ProviderObjectSummary[];
  prefixes: string[];
  nextCursor: string | null;
  isTruncated: boolean;
}

export interface InitiateMultipartInput extends StorageLocation {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface InitiateMultipartResult {
  providerUploadId: string;
}

export interface UploadPartInput extends StorageLocation {
  providerUploadId: string;
  partNumber: number;
  body: Readable;
  maxSizeBytes: number;
  signal?: AbortSignal;
}

export interface UploadPartResult {
  partNumber: number;
  size: number;
  etag: string;
  /** SHA-256 calculated while streaming, when the provider can supply it. */
  checksum?: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteMultipartInput extends StorageLocation {
  providerUploadId: string;
  parts: CompletedPart[];
  contentType?: string;
}

export interface AbortMultipartInput extends StorageLocation {
  providerUploadId: string;
}

export interface PresignedUrlInput extends StorageLocation {
  expiresInSeconds: number;
  contentType?: string;
  /**
   * Exact body length the signed upload URL is bound to. Signing it makes the
   * provider reject a body of any other size, which is what enforces the
   * object size ceiling on uploads that never stream through VaultStack.
   */
  contentLength?: number;
  /** Suggested download filename, surfaced as a content disposition. */
  downloadFilename?: string;
}

export interface PresignedPartUrlInput extends StorageLocation {
  providerUploadId: string;
  partNumber: number;
  expiresInSeconds: number;
  contentLength?: number;
  /** Hex SHA-256; providers that support it bind this into the signature. */
  checksumSha256?: string;
}

export interface InspectPartInput extends StorageLocation {
  providerUploadId: string;
  partNumber: number;
}

export interface ListProviderPartsInput extends StorageLocation {
  providerUploadId: string;
}

export interface ProviderPartInfo {
  partNumber: number;
  size: number;
  etag: string;
  checksumSha256?: string;
}

export interface CapacityCheckInput {
  requiredBytes: number;
}

export interface CapacityCheckResult {
  ok: boolean;
  availableBytes?: number;
}

export interface PresignedUrl {
  url: string;
  method: 'GET' | 'PUT';
  expiresAt: Date;
  headers?: Record<string, string>;
}

export interface ProviderHealth {
  ok: boolean;
  message?: string;
}

export interface StorageProviderContext {
  type: StorageProviderTypeName;
}
