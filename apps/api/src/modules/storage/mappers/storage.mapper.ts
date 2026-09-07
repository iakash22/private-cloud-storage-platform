import type {
  PublicBucket,
  PublicStorageObject,
  PublicStorageProvider,
  PublicUpload,
  StorageProviderTypeName,
  UploadStatusName,
} from '@vaultstack/types';
import type { Prisma } from '@vaultstack/database';

export function serializeStorageProvider(provider: {
  id: string;
  organizationId: string;
  name: string;
  type: string;
  status: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicStorageProvider {
  return {
    id: provider.id,
    organizationId: provider.organizationId,
    name: provider.name,
    type: provider.type as StorageProviderTypeName,
    status: provider.status,
    isDefault: provider.isDefault,
    createdAt: provider.createdAt.toISOString(),
    updatedAt: provider.updatedAt.toISOString(),
  };
}

export function serializeBucket(bucket: {
  id: string;
  organizationId: string;
  storageProviderId: string;
  name: string;
  region: string | null;
  versioning: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicBucket {
  return {
    id: bucket.id,
    organizationId: bucket.organizationId,
    storageProviderId: bucket.storageProviderId,
    name: bucket.name,
    region: bucket.region,
    versioning: bucket.versioning,
    createdAt: bucket.createdAt.toISOString(),
    updatedAt: bucket.updatedAt.toISOString(),
  };
}

export function serializeStorageObject(object: {
  id: string;
  bucketId: string;
  key: string;
  size: bigint;
  contentType: string;
  etag: string;
  checksumAlgorithm: string;
  checksum: string | null;
  currentVersionId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): PublicStorageObject {
  return {
    id: object.id,
    bucketId: object.bucketId,
    key: object.key,
    size: Number(object.size),
    contentType: object.contentType,
    etag: object.etag,
    checksumAlgorithm: object.checksumAlgorithm,
    checksum: object.checksum,
    versionId: object.currentVersionId,
    metadata: asStringMetadata(object.metadata),
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

export function serializeUpload(upload: {
  id: string;
  bucketId: string;
  key: string;
  status: string;
  contentType: string | null;
  declaredSize: bigint | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): PublicUpload {
  return {
    id: upload.id,
    bucketId: upload.bucketId,
    key: upload.key,
    status: upload.status as UploadStatusName,
    contentType: upload.contentType,
    declaredSize: upload.declaredSize === null ? null : Number(upload.declaredSize),
    expiresAt: upload.expiresAt.toISOString(),
    createdAt: upload.createdAt.toISOString(),
    updatedAt: upload.updatedAt.toISOString(),
  };
}

function asStringMetadata(value: Prisma.JsonValue): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}
