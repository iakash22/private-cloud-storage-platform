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
  'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export const PERMISSIONS = {
  ORGANIZATIONS_READ: 'organizations:read',
  ORGANIZATIONS_UPDATE: 'organizations:update',
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  TEAMS_READ: 'teams:read',
  TEAMS_CREATE: 'teams:create',
  TEAMS_UPDATE: 'teams:update',
  TEAMS_DELETE: 'teams:delete',
  ROLES_READ: 'roles:read',
  ROLES_CREATE: 'roles:create',
  ROLES_UPDATE: 'roles:update',
  ROLES_ASSIGN: 'roles:assign',
  PERMISSIONS_READ: 'permissions:read',
  API_KEYS_READ: 'api-keys:read',
  API_KEYS_CREATE: 'api-keys:create',
  API_KEYS_REVOKE: 'api-keys:revoke',
  AUDIT_READ: 'audit:read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const MEMBER_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.ORGANIZATIONS_READ,
  PERMISSIONS.USERS_READ,
  PERMISSIONS.TEAMS_READ,
  PERMISSIONS.ROLES_READ,
  PERMISSIONS.PERMISSIONS_READ,
  PERMISSIONS.AUDIT_READ,
];

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
