import type { PrismaClient } from '@vaultstack/database';
import { serializeAuditLog } from '../mappers/audit-log.mapper.js';

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  result?: 'success' | 'failure';
}

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    organizationId: string,
    filtersOrLimit: AuditLogFilters | number = {},
    requestedLimit = 50,
  ) {
    const filters = typeof filtersOrLimit === 'number' ? {} : filtersOrLimit;
    const limit = typeof filtersOrLimit === 'number' ? filtersOrLimit : requestedLimit;
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) {
      createdAt.gte = startOfDay(filters.dateFrom);
    }
    if (filters.dateTo) {
      createdAt.lte = endOfDay(filters.dateTo);
    }

    const logs = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
        ...(filters.result ? { result: filters.result } : {}),
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      },
      include: {
        user: { select: { name: true } },
        serviceAccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return logs.map(serializeAuditLog);
  }
}

function startOfDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function endOfDay(value: string): Date {
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

/** @deprecated Prefer constructing AuditService through AppContainer. */
export function createAuditService(prisma: PrismaClient): AuditService {
  return new AuditService(prisma);
}
