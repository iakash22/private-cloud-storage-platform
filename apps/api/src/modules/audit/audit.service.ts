import type { PrismaClient } from '@vaultstack/database';
import { serializeAuditLog } from '../../lib/serializers.js';

export function createAuditService(prisma: PrismaClient) {
  return {
    async list(organizationId: string, limit = 50) {
      const logs = await prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return logs.map(serializeAuditLog);
    },
  };
}
