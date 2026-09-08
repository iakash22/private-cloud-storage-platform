import type { Prisma, PrismaClient } from '@vaultstack/database';

export interface WriteAuditLogInput {
  organizationId: string;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(
  prisma: PrismaClient,
  input: WriteAuditLogInput,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      userId: await resolveAuditUserId(prisma, input.userId),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
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
  };
}
