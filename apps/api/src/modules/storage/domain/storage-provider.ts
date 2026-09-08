import type { StorageProviderTypeName } from '@vaultstack/types';
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
} from './storage.types.js';

/**
 * The single abstraction all storage backends implement.
 *
 * Business logic depends only on this interface. It must never branch on the
 * concrete provider (no `if (type === 'minio')`); anything a backend cannot do
 * is expressed through `capabilities` instead.
 */
export interface StorageProvider {
  readonly type: StorageProviderTypeName;
  readonly capabilities: StorageProviderCapabilities;

  createBucket(ref: ProviderBucketRef): Promise<void>;
  listBuckets(): Promise<ProviderBucketSummary[]>;
  getBucket(ref: ProviderBucketRef): Promise<ProviderBucketSummary | null>;
  deleteBucket(ref: ProviderBucketRef): Promise<void>;

  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  headObject(location: StorageLocation): Promise<HeadObjectResult | null>;
  deleteObject(location: StorageLocation): Promise<void>;
  copyObject(input: CopyObjectInput): Promise<PutObjectResult>;
  listObjects(input: ListObjectsInput): Promise<ProviderObjectListPage>;

  initiateMultipartUpload(input: InitiateMultipartInput): Promise<InitiateMultipartResult>;
  uploadPart(input: UploadPartInput): Promise<UploadPartResult>;
  completeMultipartUpload(input: CompleteMultipartInput): Promise<PutObjectResult>;
  abortMultipartUpload(input: AbortMultipartInput): Promise<void>;
  inspectPart(input: InspectPartInput): Promise<ProviderPartInfo | null>;
  listProviderParts(input: ListProviderPartsInput): Promise<ProviderPartInfo[]>;
  createPresignedPartUrl(input: PresignedPartUrlInput): Promise<PresignedUrl>;
  checkCapacity(input: CapacityCheckInput): Promise<CapacityCheckResult>;
  cleanupOrphanStaging(olderThan: Date): Promise<number>;

  createPresignedDownloadUrl(input: PresignedUrlInput): Promise<PresignedUrl>;
  createPresignedUploadUrl(input: PresignedUrlInput): Promise<PresignedUrl>;

  healthCheck(): Promise<ProviderHealth>;
}

export interface StorageProviderCapabilities {
  /** True when the backend itself issues presigned URLs (S3-compatible). */
  nativePresignedUrls: boolean;
  /** True when the backend tracks its own object version identifiers. */
  nativeVersioning: boolean;
  /** True when the backend performs server-side copies without streaming. */
  serverSideCopy: boolean;
  /** True when the backend can mint a direct UploadPart destination. */
  directPartDestinations: boolean;
  /** True when the backend can list or inspect uploaded parts itself. */
  providerPartInspection: boolean;
  /** True when the backend can report remaining writable capacity. */
  capacityChecks: boolean;
}
