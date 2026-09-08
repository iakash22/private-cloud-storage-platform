import { BucketVersioningStatus } from '@vaultstack/database';

/**
 * Version history is a control-plane concern recorded in PostgreSQL.
 *
 * Providers only store opaque physical keys. Local has no native version ids;
 * S3-compatible backends may, but VaultStack does not enable provider bucket
 * versioning and does not pass provider version ids through StorageProvider.
 * Both backends therefore address versions the same way: unique physical keys.
 */
export function retainsVersionHistory(status: BucketVersioningStatus): boolean {
  return status === BucketVersioningStatus.ENABLED;
}

export function usesDeleteMarkers(status: BucketVersioningStatus): boolean {
  return status === BucketVersioningStatus.ENABLED;
}

/**
 * Suspended buckets keep older versions from when versioning was enabled, but
 * a new put replaces only the current version rather than growing history.
 */
export function replacesCurrentVersionOnPut(status: BucketVersioningStatus): boolean {
  return status === BucketVersioningStatus.SUSPENDED;
}

export function discardsAllNonCurrentOnPut(status: BucketVersioningStatus): boolean {
  return status === BucketVersioningStatus.UNVERSIONED;
}
