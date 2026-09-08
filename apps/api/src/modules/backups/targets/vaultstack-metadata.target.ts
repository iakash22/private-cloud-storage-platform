import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath, writeJsonFile } from '../domain/redact.js';

export function createVaultstackMetadataTarget(): BackupTargetAdapter {
  return {
    target: 'VAULTSTACK_METADATA',
    scope: 'organization',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const { prisma, organizationId } = ctx;

      const [
        organization,
        users,
        roles,
        teams,
        buckets,
        providers,
        projects,
        artifacts,
        schedules,
      ] = await Promise.all([
        prisma.organization.findUnique({
          where: { id: organizationId },
          select: { id: true, name: true, slug: true, createdAt: true, updatedAt: true },
        }),
        prisma.userRole.findMany({
          where: { organizationId },
          select: {
            userId: true,
            role: { select: { name: true } },
            user: { select: { id: true, email: true, name: true, disabledAt: true } },
          },
        }),
        prisma.role.findMany({
          where: { organizationId },
          select: { id: true, name: true, description: true, isSystem: true },
        }),
        prisma.team.findMany({
          where: { organizationId },
          select: { id: true, name: true },
        }),
        prisma.bucket.findMany({
          where: { organizationId },
          select: { id: true, name: true, versioning: true, storageProviderId: true },
        }),
        prisma.storageProvider.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            isDefault: true,
            config: true,
          },
        }),
        prisma.project.findMany({
          where: { organizationId },
          select: { id: true, name: true, slug: true, retentionDays: true },
        }),
        prisma.artifact.findMany({
          where: { organizationId },
          select: { id: true, name: true, kind: true, projectId: true, buildId: true },
        }),
        prisma.backupSchedule.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            enabled: true,
            targets: true,
            intervalMinutes: true,
            retentionDays: true,
            retentionCount: true,
          },
        }),
      ]);

      const dest = componentPath(ctx.workDir, 'vaultstack-metadata.json');
      await writeJsonFile(dest, {
        organization,
        memberships: users.map((row) => ({
          userId: row.user.id,
          email: row.user.email,
          name: row.user.name,
          disabledAt: row.user.disabledAt,
          role: row.role.name,
        })),
        roles,
        teams,
        buckets,
        providers,
        projects,
        artifacts,
        backupSchedules: schedules,
      });

      return {
        target: 'VAULTSTACK_METADATA',
        status: 'collected',
        relativeFiles: ['components/vaultstack-metadata.json'],
      };
    },
  };
}
