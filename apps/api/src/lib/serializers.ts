import type {
  PublicApiKey,
  PublicAuditLog,
  PublicOrganization,
  PublicPermission,
  PublicRole,
  PublicTeam,
  PublicUser,
} from '@vaultstack/types';
import type { Prisma } from '@vaultstack/database';

export function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
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
