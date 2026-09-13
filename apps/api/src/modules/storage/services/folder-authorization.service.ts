import type { PrismaClient } from '@vaultstack/database';
import { storageAccessDenied } from '../../../lib/errors.js';

export type FolderAccessAction = 'READ' | 'WRITE' | 'DELETE' | 'SHARE' | 'MANAGE';

export interface FolderAuthorizationService {
  can(input: {
    organizationId: string;
    bucketId: string;
    key: string;
    userId: string | null | undefined;
    action: FolderAccessAction;
  }): Promise<boolean>;
  assert(input: {
    organizationId: string;
    bucketId: string;
    key: string;
    userId: string | null | undefined;
    action: FolderAccessAction;
  }): Promise<void>;
}

const ROLE_RANK: Record<string, number> = {
  VIEWER: 1,
  EDITOR: 2,
  MANAGER: 3,
};

const ACTION_RANK: Record<FolderAccessAction, number> = {
  READ: 1,
  WRITE: 2,
  DELETE: 3,
  SHARE: 3,
  MANAGE: 3,
};

export function createFolderAuthorizationService(
  prisma: PrismaClient,
): FolderAuthorizationService {
  return {
    async can({ organizationId, bucketId, key, userId, action }) {
      const rules = await prisma.folderAccessRule.findMany({
        where: { organizationId, bucketId },
        select: { prefix: true, role: true, userId: true, teamId: true },
      });

      const matching = rules.filter((rule) => key.startsWith(rule.prefix));
      if (matching.length === 0) {
        return true;
      }

      const deepestPrefixLength = Math.max(...matching.map((rule) => rule.prefix.length));
      const deepest = matching.filter((rule) => rule.prefix.length === deepestPrefixLength);
      const teamIds = deepest.flatMap((rule) => (rule.teamId ? [rule.teamId] : []));
      const memberships =
        userId && teamIds.length > 0
          ? await prisma.teamMember.findMany({
              where: { organizationId, userId, teamId: { in: teamIds } },
              select: { teamId: true },
            })
          : [];
      const memberTeams = new Set(memberships.map((membership) => membership.teamId));
      const applicable = deepest.filter(
        (rule) =>
          (Boolean(userId) && rule.userId === userId) ||
          (rule.teamId !== null && memberTeams.has(rule.teamId)),
      );

      if (applicable.length === 0) {
        return false;
      }

      const highestRole = Math.max(...applicable.map((rule) => ROLE_RANK[rule.role] ?? 0));
      return highestRole >= ACTION_RANK[action];
    },

    async assert(input) {
      if (!(await this.can(input))) {
        throw storageAccessDenied('You do not have access to this folder');
      }
    },
  };
}
