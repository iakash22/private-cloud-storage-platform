import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { FolderAccessRole, PublicFolderAccessRule } from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import { conflict, validationError } from '../../../lib/errors.js';
import { assertValidKeyPrefix } from '../domain/object-key.js';
import type { RequestMeta } from './bucket.service.js';
import type { StorageService } from './storage.service.js';

export interface CreateFolderAccessRuleInput {
  organizationId: string;
  bucketId: string;
  prefix: string;
  role: FolderAccessRole;
  userId?: string;
  teamId?: string;
  actorUserId: string;
  meta: RequestMeta;
}

export interface FolderAccessService {
  list(
    organizationId: string,
    bucketId: string,
    prefix?: string,
  ): Promise<PublicFolderAccessRule[]>;
  create(input: CreateFolderAccessRuleInput): Promise<PublicFolderAccessRule>;
  remove(
    organizationId: string,
    ruleId: string,
    actorUserId: string,
    meta: RequestMeta,
  ): Promise<void>;
}

export function createFolderAccessService(deps: {
  prisma: PrismaClient;
  storage: StorageService;
  logger: Logger;
}): FolderAccessService {
  const { prisma, storage, logger } = deps;

  return {
    async list(organizationId, bucketId, prefix) {
      const rows = await prisma.folderAccessRule.findMany({
        where: { organizationId, bucketId, ...(prefix ? { prefix } : {}) },
        include: {
          user: { select: { name: true, email: true } },
          team: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(serializeRule);
    },

    async create(input) {
      await storage.resolveBucket(input.organizationId, input.bucketId);
      const prefix = normalizePrefix(input.prefix, storage.limits.maxKeyLength);
      if (input.userId) {
        const user = await prisma.user.findFirst({ where: { id: input.userId } });
        if (!user) {
          throw validationError('User not found', { userId: 'User not found' });
        }
      }
      if (input.teamId) {
        const team = await prisma.team.findFirst({
          where: { id: input.teamId, organizationId: input.organizationId },
        });
        if (!team) {
          throw validationError('Team not found', { teamId: 'Team not found' });
        }
      }
      try {
        const row = await prisma.folderAccessRule.create({
          data: {
            organizationId: input.organizationId,
            bucketId: input.bucketId,
            prefix,
            role: input.role,
            userId: input.userId ?? null,
            teamId: input.teamId ?? null,
            createdByUserId: input.actorUserId,
          },
          include: {
            user: { select: { name: true, email: true } },
            team: { select: { name: true } },
          },
        });
        await writeAuditLog(prisma, {
          organizationId: input.organizationId,
          userId: input.actorUserId,
          action: 'storage.folder_access.created',
          resourceType: 'folder_access_rule',
          resourceId: row.id,
          metadata: { bucketId: input.bucketId, prefix, role: input.role },
          ipAddress: input.meta.ipAddress,
          userAgent: input.meta.userAgent,
        });
        return serializeRule(row);
      } catch (error) {
        logger.error(
          { error, bucketId: input.bucketId, prefix },
          'Folder access rule creation failed',
        );
        throw conflict('A rule already exists for this folder subject');
      }
    },

    async remove(organizationId, ruleId, actorUserId, meta) {
      const row = await prisma.folderAccessRule.findFirst({
        where: { id: ruleId, organizationId },
      });
      if (!row) {
        throw validationError('Folder access rule not found');
      }
      await prisma.folderAccessRule.delete({ where: { id: ruleId } });
      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'storage.folder_access.deleted',
        resourceType: 'folder_access_rule',
        resourceId: ruleId,
        metadata: { bucketId: row.bucketId, prefix: row.prefix },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },
  };
}

function normalizePrefix(prefix: string, maxLength: number): string {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return assertValidKeyPrefix(normalized, maxLength);
}

function serializeRule(row: {
  id: string;
  organizationId: string;
  bucketId: string;
  prefix: string;
  role: string;
  userId: string | null;
  teamId: string | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { name: string; email: string } | null;
  team?: { name: string } | null;
}): PublicFolderAccessRule {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bucketId: row.bucketId,
    prefix: row.prefix,
    role: row.role as FolderAccessRole,
    userId: row.userId,
    teamId: row.teamId,
    subjectName: row.team?.name ?? row.user?.name ?? row.user?.email ?? 'Unknown subject',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
