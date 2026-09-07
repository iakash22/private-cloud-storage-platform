import type { PrismaClient } from '@vaultstack/database';
import { serializeAuditLog } from '../mappers/audit-log.mapper.js';

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string, limit = 50) {
    const logs = await this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return logs.map(serializeAuditLog);
  }
}

export function createAuditService(prisma: PrismaClient): AuditService {
  return new AuditService(prisma);
}
