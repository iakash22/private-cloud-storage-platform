import type { PrismaClient } from '@vaultstack/database';
import { conflict, notFound } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeTeam } from '../../lib/serializers.js';

export function createTeamsService(prisma: PrismaClient) {
  return {
    async list(organizationId: string) {
      const teams = await prisma.team.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });
      return teams.map(serializeTeam);
    },

    async get(organizationId: string, teamId: string) {
      const team = await prisma.team.findFirst({ where: { id: teamId, organizationId } });
      if (!team) {
        throw notFound('Team not found');
      }
      return serializeTeam(team);
    },

    async create(
      organizationId: string,
      name: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const existing = await prisma.team.findFirst({ where: { organizationId, name } });
      if (existing) {
        throw conflict('A team with that name already exists');
      }

      const team = await prisma.team.create({
        data: { organizationId, name },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'team.created',
        resourceType: 'team',
        resourceId: team.id,
        metadata: { name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeTeam(team);
    },

    async update(
      organizationId: string,
      teamId: string,
      name: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const team = await prisma.team.findFirst({ where: { id: teamId, organizationId } });
      if (!team) {
        throw notFound('Team not found');
      }

      const updated = await prisma.team.update({
        where: { id: teamId },
        data: { name },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'team.updated',
        resourceType: 'team',
        resourceId: teamId,
        metadata: { name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeTeam(updated);
    },

    async remove(
      organizationId: string,
      teamId: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const team = await prisma.team.findFirst({ where: { id: teamId, organizationId } });
      if (!team) {
        throw notFound('Team not found');
      }

      await prisma.team.delete({ where: { id: teamId } });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'team.deleted',
        resourceType: 'team',
        resourceId: teamId,
        metadata: { name: team.name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    },
  };
}
