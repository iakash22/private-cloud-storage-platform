import type { PublicAuditLog } from '@vaultstack/types';
import type { Prisma } from '@vaultstack/database';

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
