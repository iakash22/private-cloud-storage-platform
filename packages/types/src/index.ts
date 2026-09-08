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
  | 'ORGANIZATION_CONTEXT_REQUIRED'
  | 'SHARE_LINK_NOT_FOUND'
  | 'SHARE_LINK_EXPIRED'
  | 'SHARE_LINK_REVOKED'
  | 'SHARE_PASSWORD_REQUIRED'
  | 'SHARE_PASSWORD_INVALID'
  | 'SHARE_DOWNLOAD_LIMIT_REACHED'
  | 'SHARE_ACCESS_DENIED'
  | 'ARTIFACT_PROJECT_NOT_FOUND'
  | 'ARTIFACT_BUILD_NOT_FOUND'
  | 'ARTIFACT_NOT_FOUND'
  | 'ARTIFACT_VERSION_NOT_FOUND'
  | 'ARTIFACT_RELEASE_CONFLICT'
  | 'BACKUP_JOB_NOT_FOUND'
  | 'BACKUP_SNAPSHOT_NOT_FOUND'
  | 'BACKUP_SCHEDULE_NOT_FOUND'
  | 'BACKUP_RESTORE_NOT_FOUND'
  | 'BACKUP_INVALID_STATE'
  | 'BACKUP_TARGET_FORBIDDEN'
  | 'BACKUP_VERIFICATION_FAILED';

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
    PERMISSIONS.STORAGE_SHARE,
    PERMISSIONS.ARTIFACT_READ,
    PERMISSIONS.ARTIFACT_UPLOAD,
    PERMISSIONS.ARTIFACT_DELETE,
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

export interface PublicTeamMember {
  id: string;
  organizationId: string;
  teamId: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export const SHARE_VISIBILITIES = {
  PRIVATE: 'PRIVATE',
  TEAM: 'TEAM',
  ORGANIZATION: 'ORGANIZATION',
  PUBLIC_LINK: 'PUBLIC_LINK',
} as const;

export type ShareVisibilityName = (typeof SHARE_VISIBILITIES)[keyof typeof SHARE_VISIBILITIES];

/** Owner-facing share metadata. Never includes the plaintext token after creation. */
export interface PublicShareLink {
  id: string;
  organizationId: string;
  objectId: string;
  fileName: string;
  visibility: ShareVisibilityName;
  teamId: string | null;
  tokenPrefix: string;
  hasPassword: boolean;
  allowView: boolean;
  allowDownload: boolean;
  maxDownloads: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Returned once at creation. The plaintext token is never persisted. */
export interface CreatedShareLink extends PublicShareLink {
  token: string;
}

/** Consumer-facing share payload. No object ids, org ids, or storage paths. */
export interface PublicShareAccess {
  fileName: string;
  size: number;
  contentType: string;
  visibility: ShareVisibilityName;
  allowView: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
  hasPassword: boolean;
}

export interface PublicShareInspect {
  passwordRequired: boolean;
  share: PublicShareAccess | null;
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

/**
 * S3-compatible vendor dialect. Stored in provider config JSON, never as a
 * Prisma enum, so business logic cannot switch on AWS vs R2 vs MinIO.
 */
export const S3_DIALECTS = {
  AWS_S3: 'AWS_S3',
  CLOUDFLARE_R2: 'CLOUDFLARE_R2',
  BACKBLAZE_B2: 'BACKBLAZE_B2',
  MINIO: 'MINIO',
  WASABI: 'WASABI',
  DIGITALOCEAN_SPACES: 'DIGITALOCEAN_SPACES',
  GENERIC: 'GENERIC',
} as const;

export type S3DialectName = (typeof S3_DIALECTS)[keyof typeof S3_DIALECTS];

export const STORAGE_PROVIDER_STATUSES = {
  ACTIVE: 'ACTIVE',
  DEGRADED: 'DEGRADED',
  DISABLED: 'DISABLED',
} as const;

export type StorageProviderStatusName =
  (typeof STORAGE_PROVIDER_STATUSES)[keyof typeof STORAGE_PROVIDER_STATUSES];

export const STORAGE_PROVIDER_CREDENTIAL_SOURCES = {
  NONE: 'none',
  ENV: 'env',
  STORED: 'stored',
} as const;

export type StorageProviderCredentialSource =
  (typeof STORAGE_PROVIDER_CREDENTIAL_SOURCES)[keyof typeof STORAGE_PROVIDER_CREDENTIAL_SOURCES];

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

export const MULTIPART_UPLOAD_STATUSES = {
  INITIATED: 'INITIATED',
  UPLOADING: 'UPLOADING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
  EXPIRED: 'EXPIRED',
} as const;

export type MultipartUploadStatusName =
  (typeof MULTIPART_UPLOAD_STATUSES)[keyof typeof MULTIPART_UPLOAD_STATUSES];

export const MULTIPART_TRANSFER_TRANSPORTS = {
  DIRECT: 'DIRECT',
  VAULTSTACK: 'VAULTSTACK',
} as const;

export type MultipartTransferTransport =
  (typeof MULTIPART_TRANSFER_TRANSPORTS)[keyof typeof MULTIPART_TRANSFER_TRANSPORTS];

/**
 * Provider metadata safe to serialize to a browser. Secret keys, ciphertext,
 * nonces, and physical filesystem locations are deliberately absent.
 */
export interface PublicStorageProvider {
  id: string;
  organizationId: string;
  name: string;
  type: StorageProviderTypeName;
  status: string;
  isDefault: boolean;
  dialect: S3DialectName | null;
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  forcePathStyle: boolean | null;
  tls: boolean | null;
  accountId: string | null;
  accessKeyId: string | null;
  hasSecret: boolean;
  credentialsSource: StorageProviderCredentialSource;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStorageProviderHealth {
  ok: boolean;
  message: string;
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
  isDeleted: boolean;
  metadata: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicObjectVersion {
  versionId: string;
  size: number;
  contentType: string;
  etag: string;
  checksumAlgorithm: string;
  checksum: string | null;
  isCurrent: boolean;
  isDeleteMarker: boolean;
  createdAt: string;
}

export interface PublicObjectVersionListPage {
  objectId: string;
  key: string;
  versions: PublicObjectVersion[];
}

export const BUCKET_VERSIONING_STATUSES = {
  UNVERSIONED: 'UNVERSIONED',
  ENABLED: 'ENABLED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type BucketVersioningStatusName =
  (typeof BUCKET_VERSIONING_STATUSES)[keyof typeof BUCKET_VERSIONING_STATUSES];

export const STORAGE_POLICY_KINDS = {
  ACCESS: 'ACCESS',
  LIFECYCLE: 'LIFECYCLE',
} as const;

export type StoragePolicyKindName =
  (typeof STORAGE_POLICY_KINDS)[keyof typeof STORAGE_POLICY_KINDS];

export const STORAGE_LIFECYCLE_ACTIONS = {
  EXPIRE_CURRENT: 'EXPIRE_CURRENT',
  EXPIRE_NONCURRENT: 'EXPIRE_NONCURRENT',
  ABORT_INCOMPLETE_MULTIPART: 'ABORT_INCOMPLETE_MULTIPART',
  EXPIRE_TEMPORARY: 'EXPIRE_TEMPORARY',
} as const;

export type StorageLifecycleActionName =
  (typeof STORAGE_LIFECYCLE_ACTIONS)[keyof typeof STORAGE_LIFECYCLE_ACTIONS];

export interface PublicStoragePolicy {
  id: string;
  organizationId: string;
  bucketId: string | null;
  name: string;
  kind: StoragePolicyKindName;
  effect: string;
  enabled: boolean;
  actions: string[];
  keyPrefix: string | null;
  days: number | null;
  lifecycleAction: StorageLifecycleActionName | null;
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

export interface InitiatedUpload {
  upload: PublicUpload;
  uploadUrl: string;
  method: 'PUT';
  expiresAt: string;
  headers?: Record<string, string>;
}

/**
 * Browser-safe instructions for transferring one multipart part. A DIRECT
 * descriptor may contain a short-lived presigned URL, but never provider
 * credentials. VAULTSTACK sends the bytes through the API.
 */
export interface MultipartPartTransferDescriptor {
  transport: MultipartTransferTransport;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
  partNumber: number;
}

export interface PublicMultipartPart {
  partNumber: number;
  size: number;
  etag: string;
  checksumSha256: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMultipartSession {
  id: string;
  organizationId: string;
  bucketId: string;
  key: string;
  status: MultipartUploadStatusName;
  contentType: string | null;
  declaredSize: number | null;
  expiresAt: string;
  lastActivityAt: string;
  completedAt: string | null;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMultipartSessionDetail extends PublicMultipartSession {
  parts: PublicMultipartPart[];
}

export interface PublicMultipartSessionListPage {
  sessions: PublicMultipartSession[];
  nextCursor: string | null;
}

export interface AuthSessionPayload {
  user: PublicUser;
  organizations: PublicOrganization[];
  memberships: PublicMembership[];
  csrfToken: string;
  organization?: PublicOrganization;
  activeOrganizationId?: string | null;
}

export interface PublicServiceAccount {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicS3AccessCredential {
  id: string;
  organizationId: string;
  serviceAccountId: string;
  serviceAccountName: string;
  accessKeyId: string;
  permissions: string[];
  allowedBucketNames: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  rotatedFromId: string | null;
  createdAt: string;
}

export interface CreatedS3AccessCredential extends PublicS3AccessCredential {
  secretAccessKey: string;
}

export type ArtifactKindName = 'GENERIC' | 'PACKAGE' | 'LOG' | 'ARCHIVE' | 'RELEASE' | 'BUNDLE';

export type BuildStatusName = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export type ArtifactVersionStatusName = 'PENDING' | 'AVAILABLE' | 'FAILED';

export interface PublicProject {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  retentionDays: number | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBuild {
  id: string;
  organizationId: string;
  projectId: string;
  number: number;
  status: BuildStatusName;
  title: string | null;
  gitRef: string | null;
  commitSha: string | null;
  createdByUserId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicArtifact {
  id: string;
  organizationId: string;
  projectId: string;
  buildId: string;
  name: string;
  kind: ArtifactKindName;
  createdAt: string;
  updatedAt: string;
  currentVersion: PublicArtifactVersion | null;
}

export interface PublicArtifactVersion {
  id: string;
  organizationId: string;
  projectId: string;
  buildId: string;
  artifactId: string;
  version: number;
  versionLabel: string | null;
  status: ArtifactVersionStatusName;
  storageObjectId: string | null;
  isCurrent: boolean;
  isRelease: boolean;
  releaseTag: string | null;
  releasedAt: string | null;
  size: number;
  contentType: string;
  checksum: string | null;
  etag: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BackupJobStatusName =
  'QUEUED' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type BackupTargetName =
  | 'POSTGRESQL'
  | 'MONGODB'
  | 'APP_CONFIG'
  | 'DOCKER_VOLUMES'
  | 'VAULTSTACK_METADATA'
  | 'VAULTSTACK_OBJECT_METADATA';

export type BackupLogLevelName = 'INFO' | 'WARN' | 'ERROR';

export interface PublicBackupSchedule {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  targets: BackupTargetName[];
  intervalMinutes: number;
  retentionDays: number | null;
  retentionCount: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBackupJob {
  id: string;
  organizationId: string;
  scheduleId: string | null;
  createdByUserId: string | null;
  status: BackupJobStatusName;
  targets: BackupTargetName[];
  progressPercent: number;
  currentStep: string | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  retryOfJobId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  snapshotId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBackupJobLog {
  id: string;
  organizationId: string;
  jobId: string;
  level: BackupLogLevelName;
  message: string;
  createdAt: string;
}

export interface PublicBackupSnapshot {
  id: string;
  organizationId: string;
  jobId: string;
  scheduleId: string | null;
  storageObjectId: string | null;
  manifestChecksum: string;
  size: number;
  verifiedAt: string | null;
  verificationPassed: boolean;
  verificationError: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupRestorePlanComponent {
  path: string;
  checksum: string;
  restorable: boolean;
  notes: string;
}

export interface BackupRestorePlan {
  snapshotId: string;
  jobId: string;
  targets: BackupTargetName[];
  components: BackupRestorePlanComponent[];
  warnings: string[];
  destructive: boolean;
}

export interface PublicBackupRestoreJob {
  id: string;
  organizationId: string;
  snapshotId: string;
  createdByUserId: string | null;
  status: BackupJobStatusName;
  progressPercent: number;
  currentStep: string | null;
  restorePlan: BackupRestorePlan | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBackupSummary {
  jobCounts: Record<BackupJobStatusName, number>;
  snapshotCount: number;
  scheduleCount: number;
  restoreCount: number;
  latestJob: PublicBackupJob | null;
  latestSnapshot: PublicBackupSnapshot | null;
}

export interface PublicBackupVerification {
  snapshot: PublicBackupSnapshot;
  passed: boolean;
  error: string | null;
}

export interface InitiatedArtifactUpload {
  artifact: PublicArtifact;
  version: PublicArtifactVersion;
  upload: PublicUpload;
  uploadUrl: string;
  method: 'PUT';
  expiresAt: string;
  headers?: Record<string, string>;
}

export type { ApiResult, HttpStatus, RequestCookies, RequestHeaders, RequestMeta } from './http.js';
