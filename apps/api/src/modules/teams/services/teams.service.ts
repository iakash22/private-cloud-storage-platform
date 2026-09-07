import type { PrismaClient } from '@vaultstack/database';
import { conflict, notFound } from '../../../lib/errors.js';
import { writeAuditLog } from '../../../lib/audit.js';
import { serializeTeam } from '../mappers/team.mapper.js';

export class TeamsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string) {
    const teams = await this.prisma.team.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return teams.map(serializeTeam);
  }

  async get(organizationId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) {
      throw notFound('Team not found');
    }
    return serializeTeam(team);
  }

  async create(
    organizationId: string,
    name: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await this.prisma.team.findFirst({ where: { organizationId, name } });
    if (existing) {
      throw conflict('A team with that name already exists');
    }

    const team = await this.prisma.team.create({
      data: { organizationId, name },
    });

    await writeAuditLog(this.prisma, {
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
  }

  async update(
    organizationId: string,
    teamId: string,
    name: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) {
      throw notFound('Team not found');
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { name },
    });

    await writeAuditLog(this.prisma, {
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
  }

  async remove(
    organizationId: string,
    teamId: string,
    actorUserId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, organizationId } });
    if (!team) {
      throw notFound('Team not found');
    }

    await this.prisma.team.delete({ where: { id: teamId } });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId: actorUserId,
      action: 'team.deleted',
      resourceType: 'team',
      resourceId: teamId,
      metadata: { name: team.name },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }
}

export function createTeamsService(prisma: PrismaClient): TeamsService {
  return new TeamsService(prisma);
}
