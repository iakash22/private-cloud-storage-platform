import type {
  PublicApiKey,
  PublicAuditLog,
  PublicBucket,
  PublicOrganization,
  PublicPermission,
  PublicRole,
  PublicStorageObject,
  PublicStorageProvider,
  PublicTeam,
  PublicUpload,
  PublicUser,
  StorageProviderTypeName,
  UploadStatusName,
} from '@vaultstack/types';
import type { Prisma } from '@vaultstack/database';

export function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  disabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    disabled: user.disabledAt != null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function serializeOrganization(organization: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

export function serializeTeam(team: {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicTeam {
  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
}

export function serializeRole(role: {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: { key: string } }[];
}): PublicRole {
  return {
    id: role.id,
    organizationId: role.organizationId,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((item) => item.permission.key),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

export function serializePermission(permission: {
  id: string;
  key: string;
  description: string;
}): PublicPermission {
  return {
    id: permission.id,
    key: permission.key,
    description: permission.description,
  };
}

export function serializeApiKey(apiKey: {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): PublicApiKey {
  return {
    id: apiKey.id,
    organizationId: apiKey.organizationId,
    userId: apiKey.userId,
    name: apiKey.name,
    prefix: apiKey.prefix,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    expiresAt: apiKey.expiresAt?.toISOString() ?? null,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    createdAt: apiKey.createdAt.toISOString(),
  };
}

export function serializeAuditLog(log: {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): PublicAuditLog {
  return {
    id: log.id,
    organizationId: log.organizationId,
    userId: log.userId,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    metadata: asMetadata(log.metadata),
    createdAt: log.createdAt.toISOString(),
  };
}

function asMetadata(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { ...value };
  }
  return null;
}

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
  // `config` and `credentialRef` are intentionally omitted: provider settings
  // and credential references never reach a client.
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
  // `physicalPrefix` is deliberately not serialized.
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
  // `physicalKey` and `storageProviderId` are deliberately not serialized so
  // that no internal storage location can be inferred by a client.
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
  // `tokenHash` and `stagingKey` are deliberately not serialized.
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
