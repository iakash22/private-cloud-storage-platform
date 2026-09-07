import { PERMISSIONS } from '@vaultstack/types';
import { forbidden, storageAccessDenied } from '../../lib/errors.js';
import type { S3Operation } from './s3-operations.js';
import type { S3Principal } from './s3-auth.strategy.js';

const OPERATION_PERMISSIONS: Record<S3Operation, string> = {
  ListBuckets: PERMISSIONS.STORAGE_READ,
  HeadBucket: PERMISSIONS.STORAGE_READ,
  ListObjects: PERMISSIONS.STORAGE_READ,
  ListObjectsV2: PERMISSIONS.STORAGE_READ,
  GetObject: PERMISSIONS.STORAGE_READ,
  HeadObject: PERMISSIONS.STORAGE_READ,
  CreateBucket: PERMISSIONS.STORAGE_UPLOAD,
  PutObject: PERMISSIONS.STORAGE_UPLOAD,
  CopyObject: PERMISSIONS.STORAGE_UPLOAD,
  CreateMultipartUpload: PERMISSIONS.STORAGE_UPLOAD,
  UploadPart: PERMISSIONS.STORAGE_UPLOAD,
  CompleteMultipartUpload: PERMISSIONS.STORAGE_UPLOAD,
  DeleteBucket: PERMISSIONS.STORAGE_DELETE,
  DeleteObject: PERMISSIONS.STORAGE_DELETE,
  AbortMultipartUpload: PERMISSIONS.STORAGE_DELETE,
};

export function requireS3Permission(principal: S3Principal, operation: S3Operation, bucket?: string): void {
  const permission = OPERATION_PERMISSIONS[operation];
  if (!principal.permissions.includes(permission)) {
    throw storageAccessDenied('Credential lacks permission for this S3 operation');
  }

  if (bucket && principal.allowedBucketNames.length > 0 && !principal.allowedBucketNames.includes(bucket)) {
    throw storageAccessDenied('Credential is not authorized for this bucket');
  }
}

export function filterAllowedBuckets<T extends { name: string }>(
  principal: S3Principal,
  buckets: T[],
): T[] {
  if (principal.allowedBucketNames.length === 0) {
    return buckets;
  }

  const allowed = new Set(principal.allowedBucketNames);
  return buckets.filter((bucket) => allowed.has(bucket.name));
}

export function assertCredentialActive(input: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  serviceAccountDisabledAt: Date | null;
}): void {
  if (input.serviceAccountDisabledAt) {
    throw forbidden('Service account is disabled');
  }

  if (input.revokedAt) {
    throw forbidden('S3 credential has been revoked');
  }

  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw forbidden('S3 credential has expired');
  }
}
