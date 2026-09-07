export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  uptime: number;
}

export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  message?: string;
}

export interface ReadinessResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  checks: DependencyCheck[];
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'PAYLOAD_TOO_LARGE'
  | 'STORAGE_BUCKET_NOT_FOUND'
  | 'STORAGE_BUCKET_NOT_EMPTY'
  | 'STORAGE_OBJECT_NOT_FOUND'
  | 'STORAGE_ACCESS_DENIED'
  | 'STORAGE_PROVIDER_UNAVAILABLE'
  | 'STORAGE_PROVIDER_NOT_FOUND'
  | 'STORAGE_UPLOAD_FAILED'
  | 'STORAGE_UPLOAD_NOT_FOUND'
  | 'STORAGE_UPLOAD_EXPIRED'
  | 'STORAGE_UPLOAD_INVALID_STATE'
  | 'STORAGE_CHECKSUM_MISMATCH'
  | 'STORAGE_CHECKSUM_UNVERIFIABLE'
  | 'STORAGE_SIZE_MISMATCH'
  | 'STORAGE_OBJECT_TOO_LARGE'
  | 'STORAGE_INVALID_KEY'
  | 'STORAGE_INVALID_BUCKET_NAME'
  | 'STORAGE_MULTIPART_NOT_FOUND'
  | 'STORAGE_MULTIPART_INVALID_PART'
  | 'STORAGE_NOT_IMPLEMENTED'
  | 'ORGANIZATION_CONTEXT_REQUIRED';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export const PERMISSIONS = {
  STORAGE_READ: 'storage.read',
  STORAGE_UPLOAD: 'storage.upload',
  STORAGE_DELETE: 'storage.delete',
  STORAGE_SHARE: 'storage.share',
  ARTIFACT_READ: 'artifact.read',
  ARTIFACT_UPLOAD: 'artifact.upload',
  ARTIFACT_DELETE: 'artifact.delete',
  BACKUP_READ: 'backup.read',
  BACKUP_CREATE: 'backup.create',
  BACKUP_RESTORE: 'backup.restore',
  BACKUP_DELETE: 'backup.delete',
  INFRASTRUCTURE_READ: 'infrastructure.read',
  INFRASTRUCTURE_MANAGE: 'infrastructure.manage',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  STORAGE_ADMIN: 'STORAGE_ADMIN',
  BACKUP_ADMIN: 'BACKUP_ADMIN',
  DEVELOPER: 'DEVELOPER',
  VIEWER: 'VIEWER',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const ALL_SYSTEM_ROLES: SystemRoleName[] = Object.values(SYSTEM_ROLES);

const READ_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.STORAGE_READ,
  PERMISSIONS.ARTIFACT_READ,
  PERMISSIONS.BACKUP_READ,
  PERMISSIONS.INFRASTRUCTURE_READ,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.AUDIT_READ,
];

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, readonly PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.INFRASTRUCTURE_READ,
    PERMISSIONS.STORAGE_READ,
    PERMISSIONS.ARTIFACT_READ,
    PERMISSIONS.BACKUP_READ,
  ],
  STORAGE_ADMIN: [
    PERMISSIONS.STORAGE_READ,
    PERMISSIONS.STORAGE_UPLOAD,
    PERMISSIONS.STORAGE_DELETE,
    PERMISSIONS.STORAGE_SHARE,
    PERMISSIONS.ARTIFACT_READ,
  ],
  BACKUP_ADMIN: [
    PERMISSIONS.BACKUP_READ,
    PERMISSIONS.BACKUP_CREATE,
    PERMISSIONS.BACKUP_RESTORE,
    PERMISSIONS.BACKUP_DELETE,
  ],
  DEVELOPER: [
    PERMISSIONS.STORAGE_READ,
    PERMISSIONS.STORAGE_UPLOAD,
    PERMISSIONS.ARTIFACT_READ,
    PERMISSIONS.ARTIFACT_UPLOAD,
    PERMISSIONS.BACKUP_READ,
  ],
  VIEWER: READ_PERMISSIONS,
};

export const SYSTEM_ROLE_DESCRIPTIONS: Record<SystemRoleName, string> = {
  SUPER_ADMIN: 'Full access to every organization permission',
  ADMIN: 'Manage users, roles, and organization settings',
  STORAGE_ADMIN: 'Manage object storage and sharing',
  BACKUP_ADMIN: 'Create, restore, and delete backups',
  DEVELOPER: 'Upload storage objects and CI artifacts',
  VIEWER: 'Read-only access across organization resources',
};

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthorizationResource {
  type: string;
  organizationId: string;
  id?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMembership {
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface PublicTeam {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRole {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicPermission {
  id: string;
  key: string;
  description: string;
}

export interface PublicApiKey {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface PublicAuditLog {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export const SESSION_COOKIE_NAME = 'vs_session';
export const CSRF_COOKIE_NAME = 'vs_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Selects which organization a browser request acts on. It is only a selector:
 * the API always re-validates it against the caller's persisted memberships and
 * re-runs the RBAC permission check, so a forged value can never widen access.
 */
export const ORGANIZATION_COOKIE_NAME = 'vs_org';
export const ORGANIZATION_HEADER_NAME = 'x-vaultstack-organization';

export const STORAGE_PROVIDER_TYPES = {
  LOCAL_FILESYSTEM: 'LOCAL_FILESYSTEM',
  S3_COMPATIBLE: 'S3_COMPATIBLE',
} as const;

export type StorageProviderTypeName =
  (typeof STORAGE_PROVIDER_TYPES)[keyof typeof STORAGE_PROVIDER_TYPES];

export const UPLOAD_STATUSES = {
  PENDING: 'PENDING',
  UPLOADING: 'UPLOADING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
  EXPIRED: 'EXPIRED',
} as const;

export type UploadStatusName = (typeof UPLOAD_STATUSES)[keyof typeof UPLOAD_STATUSES];

/**
 * Provider metadata safe to serialize to a browser. Credentials and physical
 * filesystem locations are deliberately absent.
 */
export interface PublicStorageProvider {
  id: string;
  organizationId: string;
  name: string;
  type: StorageProviderTypeName;
  status: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBucket {
  id: string;
  organizationId: string;
  storageProviderId: string;
  name: string;
  region: string | null;
  versioning: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStorageObject {
  id: string;
  bucketId: string;
  key: string;
  size: number;
  contentType: string;
  etag: string;
  checksumAlgorithm: string;
  checksum: string | null;
  versionId: string | null;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicObjectListPage {
  objects: PublicStorageObject[];
  prefixes: string[];
  nextCursor: string | null;
  isTruncated: boolean;
}

export interface PublicUpload {
  id: string;
  bucketId: string;
  key: string;
  status: UploadStatusName;
  contentType: string | null;
  declaredSize: number | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPresignedUrl {
  url: string;
  method: string;
  expiresAt: string;
  headers?: Record<string, string>;
}

export type {
  ApiResult,
  HttpStatus,
  RequestCookies,
  RequestHeaders,
  RequestMeta,
} from './http.js';
