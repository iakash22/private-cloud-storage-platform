import type {
  PublicBucket,
  PublicMultipartPart,
  PublicMultipartSession,
  PublicMultipartSessionDetail,
  PublicObjectVersion,
  PublicStorageObject,
  PublicStoragePolicy,
  PublicStorageProvider,
  PublicUpload,
  StorageLifecycleActionName,
  StoragePolicyKindName,
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
  isDeleted: boolean;
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
    isDeleted: object.isDeleted,
    metadata: asStringMetadata(object.metadata),
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString(),
  };
}

export function serializeObjectVersion(version: {
  versionId: string;
  size: bigint;
  contentType: string;
  etag: string;
  checksumAlgorithm: string;
  checksum: string | null;
  isCurrent: boolean;
  isDeleteMarker: boolean;
  createdAt: Date;
}): PublicObjectVersion {
  return {
    versionId: version.versionId,
    size: Number(version.size),
    contentType: version.contentType,
    etag: version.etag,
    checksumAlgorithm: version.checksumAlgorithm,
    checksum: version.checksum,
    isCurrent: version.isCurrent,
    isDeleteMarker: version.isDeleteMarker,
    createdAt: version.createdAt.toISOString(),
  };
}

export function serializeStoragePolicy(policy: {
  id: string;
  organizationId: string;
  bucketId: string | null;
  name: string;
  kind: string;
  effect: string;
  enabled: boolean;
  actions: string[];
  keyPrefix: string | null;
  days: number | null;
  lifecycleAction: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicStoragePolicy {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    bucketId: policy.bucketId,
    name: policy.name,
    kind: policy.kind as StoragePolicyKindName,
    effect: policy.effect,
    enabled: policy.enabled,
    actions: policy.actions,
    keyPrefix: policy.keyPrefix,
    days: policy.days,
    lifecycleAction: policy.lifecycleAction as StorageLifecycleActionName | null,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
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

export function serializeMultipartPart(part: {
  partNumber: number;
  size: bigint;
  etag: string;
  checksum: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicMultipartPart {
  return {
    partNumber: part.partNumber,
    size: Number(part.size),
    etag: part.etag,
    checksumSha256: part.checksum,
    createdAt: part.createdAt.toISOString(),
    updatedAt: part.updatedAt.toISOString(),
  };
}

export function serializeMultipartSession(session: {
  id: string;
  organizationId: string;
  bucketId: string;
  key: string;
  status: string;
  contentType: string | null;
  declaredSize: bigint | null;
  expiresAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
  failureCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicMultipartSession {
  return {
    id: session.id,
    organizationId: session.organizationId,
    bucketId: session.bucketId,
    key: session.key,
    status: session.status as PublicMultipartSession['status'],
    contentType: session.contentType,
    declaredSize: session.declaredSize === null ? null : Number(session.declaredSize),
    expiresAt: session.expiresAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    failureCode: session.failureCode,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function serializeMultipartSessionDetail(
  session: Parameters<typeof serializeMultipartSession>[0] & {
    parts: Parameters<typeof serializeMultipartPart>[0][];
  },
): PublicMultipartSessionDetail {
  return {
    ...serializeMultipartSession(session),
    parts: session.parts.map(serializeMultipartPart),
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
