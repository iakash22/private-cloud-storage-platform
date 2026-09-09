import type { PublicAuditLog } from '@vaultstack/types';
import type { Prisma } from '@vaultstack/database';

export function serializeAuditLog(log: {
  id: string;
  organizationId: string;
  userId: string | null;
  serviceAccountId: string | null;
  user?: { name: string } | null;
  serviceAccount?: { name: string } | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  requestId: string | null;
  ipAddress: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
}): PublicAuditLog {
  return {
    id: log.id,
    organizationId: log.organizationId,
    userId: log.userId,
    serviceAccountId: log.serviceAccountId,
    actorName: log.user?.name ?? log.serviceAccount?.name ?? null,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    result: log.result === 'failure' ? 'failure' : 'success',
    requestId: log.requestId,
    ipAddress: log.ipAddress,
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
