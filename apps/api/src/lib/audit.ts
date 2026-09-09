import type { Prisma, PrismaClient } from '@vaultstack/database';
import { getRequestContext } from './request-context.js';

export interface WriteAuditLogInput {
  organizationId: string;
  userId?: string | null;
  serviceAccountId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  result?: 'success' | 'failure';
}

export async function writeAuditLog(
  prisma: PrismaClient,
  input: WriteAuditLogInput,
): Promise<void> {
  const context = getRequestContext();
  const auditLog = (prisma as unknown as { auditLog?: Pick<PrismaClient['auditLog'], 'create'> })
    .auditLog;
  if (!auditLog) {
    return;
  }

  await auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: await resolveAuditUserId(prisma, input.userId),
      serviceAccountId: input.serviceAccountId ?? context?.serviceAccountId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      result: input.result ?? 'success',
      requestId: input.requestId ?? context?.requestId ?? null,
      metadata: sanitizeAuditMetadata(input.metadata),
      ipAddress: input.ipAddress ?? context?.ipAddress ?? null,
      userAgent: input.userAgent ?? context?.userAgent ?? null,
    },
  });
}

async function resolveAuditUserId(
  prisma: PrismaClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) {
    return null;
  }

  // Unit tests often stub Prisma without a `user` delegate.
  const users = (prisma as { user?: Pick<PrismaClient['user'], 'findUnique'> }).user;
  if (!users) {
    return userId;
  }

  const user = await users.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export function requestMeta(req: { ip?: string; get: (name: string) => string | undefined }) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    requestId: 'requestId' in req && typeof req.requestId === 'string' ? req.requestId : null,
  };
}

const SENSITIVE_METADATA_KEY =
  /(?:password|secret|authorization|cookie|credential|ciphertext|nonce|token|signature|presigned|filecontents?|body|content|payload|bytes|data)/i;
const SENSITIVE_URL = /(?:https?:\/\/|[?&](?:token|signature|x-amz-))/i;
const MAX_METADATA_STRING_LENGTH = 1_024;

/**
 * Audit metadata is an untrusted boundary. Callers should only pass useful
 * identifiers and dimensions, but this second line of defence prevents a
 * future caller from persisting credentials, URLs, or body data by mistake.
 */
export function sanitizeAuditMetadata(
  value: Prisma.InputJsonValue | undefined,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  const sanitized = sanitizeJsonValue(value, '');
  if (sanitized === null || sanitized === undefined) {
    return undefined;
  }

  return sanitized;
}

type JsonInput = Prisma.InputJsonValue | null;

function sanitizeJsonValue(value: JsonInput, key: string): JsonInput | undefined {
  if (key && SENSITIVE_METADATA_KEY.test(key)) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_URL.test(value)) {
      return undefined;
    }
    return value.slice(0, MAX_METADATA_STRING_LENGTH);
  }

  if (Array.isArray(value)) {
    const items = value as JsonInput[];
    return items
      .map((item) => sanitizeJsonValue(item, key))
      .filter((item): item is JsonInput => item !== undefined);
  }

  if (typeof value === 'object') {
    const object = value as Prisma.JsonObject;
    const output: Record<string, JsonInput> = {};
    for (const [childKey, childValue] of Object.entries(object)) {
      const sanitized = sanitizeJsonValue(childValue ?? null, childKey);
      if (sanitized !== undefined) {
        output[childKey] = sanitized;
      }
    }
    return output;
  }

  return value;
}
