import type { EnvConfig } from '@vaultstack/config';
import { BackupJobStatus, type PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type {
  BackupJobStatusName,
  BackupTargetName,
  PublicBackupJob,
  PublicBackupJobLog,
  PublicBackupRestoreJob,
  PublicBackupSchedule,
  PublicBackupSnapshot,
  PublicBackupSummary,
  PublicBackupVerification,
} from '@vaultstack/types';
import { writeAuditLog } from '../../../lib/audit.js';
import {
  backupInvalidState,
  backupJobNotFound,
  backupRestoreNotFound,
  backupScheduleNotFound,
  backupSnapshotNotFound,
  backupTargetForbidden,
  conflict,
} from '../../../lib/errors.js';
import { isOrganizationSuperAdmin } from '../../auth/organization-roles.js';
import type { RequestMeta } from '../../storage/services/bucket.service.js';
import type { StorageModule } from '../../storage/storage.module.js';
import {
  canCancelBackupJob,
  canRetryBackupJob,
  shouldCancelBackupJobImmediately,
} from '../domain/job-lifecycle.js';
import { selectSnapshotsForRetention } from '../domain/retention.js';
import { requestedPlatformTargets } from '../domain/targets.js';
import {
  serializeBackupJob,
  serializeBackupJobLog,
  serializeBackupRestoreJob,
  serializeBackupSchedule,
  serializeBackupSnapshot,
} from '../mappers/backups.mapper.js';
import { BackupEngine } from './backup-engine.js';

const jobSnapshotInclude = { snapshot: { select: { id: true } } } as const;

export type BackupQueuePayload =
  | { kind: 'run'; backupJobId: string; organizationId: string }
  | { kind: 'restore'; restoreJobId: string; organizationId: string };

export type BackupEnqueue = (payload: BackupQueuePayload) => Promise<void>;

export class BackupsService {
  readonly engine: BackupEngine;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageModule,
    private readonly config: EnvConfig,
    private readonly logger: Logger,
    engine?: BackupEngine,
    private readonly enqueue: BackupEnqueue | null = null,
  ) {
    this.engine = engine ?? new BackupEngine(prisma, storage, config, logger);
  }

  async summary(organizationId: string): Promise<PublicBackupSummary> {
    const statuses: BackupJobStatusName[] = [
      'QUEUED',
      'RUNNING',
      'VERIFYING',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
    ];
    const counts = await Promise.all(
      statuses.map(
        async (status) =>
          [
            status,
            await this.prisma.backupJob.count({
              where: { organizationId, status },
            }),
          ] as const,
      ),
    );
    const jobCounts = Object.fromEntries(counts) as Record<BackupJobStatusName, number>;
    const [snapshotCount, scheduleCount, restoreCount, latestJob, latestSnapshot] =
      await Promise.all([
        this.prisma.backupSnapshot.count({ where: { organizationId } }),
        this.prisma.backupSchedule.count({ where: { organizationId } }),
        this.prisma.backupRestoreJob.count({ where: { organizationId } }),
        this.prisma.backupJob.findFirst({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          include: jobSnapshotInclude,
        }),
        this.prisma.backupSnapshot.findFirst({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    return {
      jobCounts,
      snapshotCount,
      scheduleCount,
      restoreCount,
      latestJob: latestJob ? serializeBackupJob(latestJob) : null,
      latestSnapshot: latestSnapshot ? serializeBackupSnapshot(latestSnapshot) : null,
    };
  }

  async listSchedules(organizationId: string): Promise<PublicBackupSchedule[]> {
    const schedules = await this.prisma.backupSchedule.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return schedules.map(serializeBackupSchedule);
  }

  async getSchedule(organizationId: string, scheduleId: string): Promise<PublicBackupSchedule> {
    return serializeBackupSchedule(await this.requireSchedule(organizationId, scheduleId));
  }

  async createSchedule(
    organizationId: string,
    userId: string,
    input: {
      name: string;
      targets: BackupTargetName[];
      enabled?: boolean;
      intervalMinutes?: number;
      retentionDays?: number | null;
      retentionCount?: number | null;
    },
    meta: RequestMeta,
  ): Promise<PublicBackupSchedule> {
    await this.assertTargetsAllowed(organizationId, userId, input.targets);
    const existing = await this.prisma.backupSchedule.findFirst({
      where: { organizationId, name: input.name },
    });
    if (existing) {
      throw conflict('A backup schedule with that name already exists');
    }

    const intervalMinutes = input.intervalMinutes ?? 1440;
    const schedule = await this.prisma.backupSchedule.create({
      data: {
        organizationId,
        name: input.name,
        targets: input.targets,
        enabled: input.enabled ?? true,
        intervalMinutes,
        retentionDays: input.retentionDays ?? null,
        retentionCount: input.retentionCount ?? null,
        createdByUserId: userId,
        nextRunAt: new Date(Date.now() + intervalMinutes * 60 * 1000),
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.schedule.created',
      resourceType: 'backup_schedule',
      resourceId: schedule.id,
      metadata: { name: schedule.name, targets: input.targets },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeBackupSchedule(schedule);
  }

  async updateSchedule(
    organizationId: string,
    scheduleId: string,
    userId: string,
    input: {
      name?: string;
      targets?: BackupTargetName[];
      enabled?: boolean;
      intervalMinutes?: number;
      retentionDays?: number | null;
      retentionCount?: number | null;
    },
    meta: RequestMeta,
  ): Promise<PublicBackupSchedule> {
    const current = await this.requireSchedule(organizationId, scheduleId);
    if (input.targets) {
      await this.assertTargetsAllowed(organizationId, userId, input.targets);
    }
    if (input.name && input.name !== current.name) {
      const clash = await this.prisma.backupSchedule.findFirst({
        where: { organizationId, name: input.name, NOT: { id: scheduleId } },
      });
      if (clash) {
        throw conflict('A backup schedule with that name already exists');
      }
    }

    const intervalMinutes = input.intervalMinutes ?? current.intervalMinutes;
    const schedule = await this.prisma.backupSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.targets !== undefined ? { targets: input.targets } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
        ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
        ...(input.retentionCount !== undefined ? { retentionCount: input.retentionCount } : {}),
        nextRunAt: current.lastRunAt
          ? new Date(current.lastRunAt.getTime() + intervalMinutes * 60 * 1000)
          : new Date(Date.now() + intervalMinutes * 60 * 1000),
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.schedule.updated',
      resourceType: 'backup_schedule',
      resourceId: scheduleId,
      metadata: { ...input },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeBackupSchedule(schedule);
  }

  async deleteSchedule(
    organizationId: string,
    scheduleId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    await this.requireSchedule(organizationId, scheduleId);
    await this.prisma.backupSchedule.delete({ where: { id: scheduleId } });
    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.schedule.deleted',
      resourceType: 'backup_schedule',
      resourceId: scheduleId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async listJobs(organizationId: string): Promise<PublicBackupJob[]> {
    const jobs = await this.prisma.backupJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: jobSnapshotInclude,
    });
    return jobs.map(serializeBackupJob);
  }

  async getJob(organizationId: string, jobId: string): Promise<PublicBackupJob> {
    return serializeBackupJob(await this.requireJob(organizationId, jobId));
  }

  async listJobLogs(organizationId: string, jobId: string): Promise<PublicBackupJobLog[]> {
    await this.requireJob(organizationId, jobId);
    const logs = await this.prisma.backupJobLog.findMany({
      where: { organizationId, jobId },
      orderBy: { createdAt: 'asc' },
    });
    return logs.map(serializeBackupJobLog);
  }

  async createJob(
    organizationId: string,
    userId: string,
    input: { targets: BackupTargetName[]; scheduleId?: string },
    meta: RequestMeta,
  ): Promise<PublicBackupJob> {
    await this.assertTargetsAllowed(organizationId, userId, input.targets);
    if (input.scheduleId) {
      await this.requireSchedule(organizationId, input.scheduleId);
    }

    const job = await this.prisma.backupJob.create({
      data: {
        organizationId,
        createdByUserId: userId,
        scheduleId: input.scheduleId ?? null,
        targets: input.targets,
        status: BackupJobStatus.QUEUED,
        currentStep: 'queued',
      },
      include: jobSnapshotInclude,
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.job.created',
      resourceType: 'backup_job',
      resourceId: job.id,
      metadata: { targets: input.targets },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.dispatch({ kind: 'run', backupJobId: job.id, organizationId });
    return serializeBackupJob(job);
  }

  async cancelJob(
    organizationId: string,
    jobId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicBackupJob> {
    const job = await this.requireJob(organizationId, jobId);
    if (!canCancelBackupJob(job.status)) {
      throw backupInvalidState('Only queued or running backup jobs can be cancelled');
    }

    const cancelledImmediately = shouldCancelBackupJobImmediately(job.status);
    const updated = await this.prisma.backupJob.update({
      where: { id: jobId },
      data: cancelledImmediately
        ? {
            status: BackupJobStatus.CANCELLED,
            cancelRequested: true,
            finishedAt: new Date(),
            currentStep: 'cancelled',
          }
        : { cancelRequested: true },
      include: jobSnapshotInclude,
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.job.cancelled',
      resourceType: 'backup_job',
      resourceId: jobId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return serializeBackupJob(updated);
  }

  async retryJob(
    organizationId: string,
    jobId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<PublicBackupJob> {
    const job = await this.requireJob(organizationId, jobId);
    if (!canRetryBackupJob(job.status)) {
      throw backupInvalidState('Only failed backup jobs can be retried');
    }

    return this.createJob(
      organizationId,
      userId,
      {
        targets: job.targets,
        scheduleId: job.scheduleId ?? undefined,
      },
      meta,
    ).then(async (created) => {
      await this.prisma.backupJob.update({
        where: { id: created.id },
        data: { retryOfJobId: job.id },
      });
      return { ...created, retryOfJobId: job.id };
    });
  }

  async listSnapshots(organizationId: string): Promise<PublicBackupSnapshot[]> {
    const snapshots = await this.prisma.backupSnapshot.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return snapshots.map(serializeBackupSnapshot);
  }

  async getSnapshot(organizationId: string, snapshotId: string): Promise<PublicBackupSnapshot> {
    return serializeBackupSnapshot(await this.requireSnapshot(organizationId, snapshotId));
  }

  async deleteSnapshot(
    organizationId: string,
    snapshotId: string,
    userId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const snapshot = await this.requireSnapshot(organizationId, snapshotId);
    const restoreCount = await this.prisma.backupRestoreJob.count({
      where: { snapshotId, status: { in: [BackupJobStatus.QUEUED, BackupJobStatus.RUNNING] } },
    });
    if (restoreCount > 0) {
      throw backupInvalidState('Cannot delete a snapshot with an in-progress restore');
    }

    await this.prisma.backupRestoreJob.deleteMany({ where: { snapshotId } });
    await this.prisma.backupSnapshot.update({
      where: { id: snapshotId },
      data: { storageObjectId: null },
    });
    await this.prisma.backupSnapshot.delete({ where: { id: snapshotId } });

    if (snapshot.storageObjectId) {
      await this.storage.objects
        .remove(organizationId, snapshot.storageObjectId, userId, meta)
        .catch(() => undefined);
    }

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.snapshot.deleted',
      resourceType: 'backup_snapshot',
      resourceId: snapshotId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  async verifySnapshot(
    organizationId: string,
    snapshotId: string,
  ): Promise<PublicBackupVerification> {
    await this.requireSnapshot(organizationId, snapshotId);
    return this.engine.verifySnapshot(organizationId, snapshotId);
  }

  async listRestores(organizationId: string): Promise<PublicBackupRestoreJob[]> {
    const jobs = await this.prisma.backupRestoreJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return jobs.map(serializeBackupRestoreJob);
  }

  async getRestore(organizationId: string, restoreId: string): Promise<PublicBackupRestoreJob> {
    const restore = await this.prisma.backupRestoreJob.findFirst({
      where: { organizationId, id: restoreId },
    });
    if (!restore) {
      throw backupRestoreNotFound();
    }
    return serializeBackupRestoreJob(restore);
  }

  async createRestore(
    organizationId: string,
    userId: string,
    snapshotId: string,
    meta: RequestMeta,
  ): Promise<PublicBackupRestoreJob> {
    await this.requireSnapshot(organizationId, snapshotId);
    const restore = await this.prisma.backupRestoreJob.create({
      data: {
        organizationId,
        snapshotId,
        createdByUserId: userId,
        status: BackupJobStatus.QUEUED,
        currentStep: 'queued',
      },
    });

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'backup.restore.created',
      resourceType: 'backup_restore',
      resourceId: restore.id,
      metadata: { snapshotId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await this.dispatch({ kind: 'restore', restoreJobId: restore.id, organizationId });
    return serializeBackupRestoreJob(restore);
  }

  async runJob(jobId: string): Promise<void> {
    await this.engine.runJob(jobId);
  }

  async runRestore(restoreJobId: string): Promise<void> {
    await this.engine.runRestore(restoreJobId);
  }

  async applyRetention(): Promise<{ expired: number }> {
    let expired = 0;
    const now = new Date();

    const globalExpired = await this.prisma.backupSnapshot.findMany({
      where: { expiresAt: { lte: now } },
    });
    for (const snapshot of globalExpired) {
      await this.deleteSnapshot(snapshot.organizationId, snapshot.id, 'system', {});
      expired += 1;
    }

    const schedules = await this.prisma.backupSchedule.findMany({
      where: {
        OR: [{ retentionDays: { not: null } }, { retentionCount: { not: null } }],
      },
    });

    for (const schedule of schedules) {
      const snapshots = await this.prisma.backupSnapshot.findMany({
        where: { scheduleId: schedule.id },
        select: { id: true, createdAt: true, expiresAt: true, organizationId: true },
      });
      const ids = selectSnapshotsForRetention(snapshots, now, {
        retentionDays: schedule.retentionDays,
        retentionCount: schedule.retentionCount,
      });
      for (const id of ids) {
        const snapshot = snapshots.find((row) => row.id === id);
        if (!snapshot) {
          continue;
        }
        const stillExists = await this.prisma.backupSnapshot.findUnique({ where: { id } });
        if (!stillExists) {
          continue;
        }
        await this.deleteSnapshot(snapshot.organizationId, id, 'system', {});
        expired += 1;
      }
    }

    return { expired };
  }

  async enqueueDueSchedules(): Promise<{ created: number }> {
    const due = await this.prisma.backupSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: new Date() } },
    });
    let created = 0;
    for (const schedule of due) {
      const job = await this.prisma.backupJob.create({
        data: {
          organizationId: schedule.organizationId,
          scheduleId: schedule.id,
          createdByUserId: schedule.createdByUserId,
          targets: schedule.targets,
          status: BackupJobStatus.QUEUED,
          currentStep: 'queued',
        },
      });
      await this.dispatch({
        kind: 'run',
        backupJobId: job.id,
        organizationId: schedule.organizationId,
      });
      await this.prisma.backupSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: new Date(Date.now() + schedule.intervalMinutes * 60 * 1000),
        },
      });
      created += 1;
    }
    return { created };
  }

  private async dispatch(payload: BackupQueuePayload): Promise<void> {
    if (this.enqueue) {
      await this.enqueue(payload);
      return;
    }
    if (this.config.BACKUP_PROCESS_INLINE) {
      void this.runPayload(payload).catch((error: unknown) => {
        this.logger.error({ err: error, payload }, 'Inline backup job failed');
      });
    }
  }

  async runPayload(payload: BackupQueuePayload): Promise<void> {
    if (payload.kind === 'run') {
      await this.engine.runJob(payload.backupJobId);
      return;
    }
    await this.engine.runRestore(payload.restoreJobId);
  }

  private async assertTargetsAllowed(
    organizationId: string,
    userId: string,
    targets: BackupTargetName[],
  ): Promise<void> {
    const platform = requestedPlatformTargets(targets);
    if (platform.length === 0) {
      return;
    }
    const allowed = await isOrganizationSuperAdmin(this.prisma, userId, organizationId);
    if (!allowed) {
      throw backupTargetForbidden();
    }
  }

  private async requireSchedule(organizationId: string, scheduleId: string) {
    const schedule = await this.prisma.backupSchedule.findFirst({
      where: { organizationId, id: scheduleId },
    });
    if (!schedule) {
      throw backupScheduleNotFound();
    }
    return schedule;
  }

  private async requireJob(organizationId: string, jobId: string) {
    const job = await this.prisma.backupJob.findFirst({
      where: { organizationId, id: jobId },
      include: jobSnapshotInclude,
    });
    if (!job) {
      throw backupJobNotFound();
    }
    return job;
  }

  private async requireSnapshot(organizationId: string, snapshotId: string) {
    const snapshot = await this.prisma.backupSnapshot.findFirst({
      where: { organizationId, id: snapshotId },
    });
    if (!snapshot) {
      throw backupSnapshotNotFound();
    }
    return snapshot;
  }
}
