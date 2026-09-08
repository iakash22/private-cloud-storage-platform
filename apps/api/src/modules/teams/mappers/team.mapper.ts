import type { PublicTeam, PublicTeamMember } from '@vaultstack/types';

export function serializeTeam(team: {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}): PublicTeam {
  return {
    id: team.id,
    organizationId: team.organizationId,
    name: team.name,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
  };
}

export function serializeTeamMember(member: {
  id: string;
  organizationId: string;
  teamId: string;
  userId: string;
  createdAt: Date;
  user: { email: string; name: string };
}): PublicTeamMember {
  return {
    id: member.id,
    organizationId: member.organizationId,
    teamId: member.teamId,
    userId: member.userId,
    email: member.user.email,
    name: member.user.name,
    createdAt: member.createdAt.toISOString(),
  };
}
