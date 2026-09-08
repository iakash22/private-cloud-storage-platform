import type {
  BackupJobStatusName,
  BackupLogLevelName,
  BackupRestorePlan,
  BackupTargetName,
  PublicBackupJob,
  PublicBackupJobLog,
  PublicBackupRestoreJob,
  PublicBackupSchedule,
  PublicBackupSnapshot,
} from '@vaultstack/types';

export function serializeBackupSchedule(schedule: {
  id: string;
  organizationId: string;
  name: string;
  enabled: boolean;
  targets: string[];
  intervalMinutes: number;
  retentionDays: number | null;
  retentionCount: number | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicBackupSchedule {
  return {
    id: schedule.id,
    organizationId: schedule.organizationId,
    name: schedule.name,
    enabled: schedule.enabled,
    targets: schedule.targets as BackupTargetName[],
    intervalMinutes: schedule.intervalMinutes,
    retentionDays: schedule.retentionDays,
    retentionCount: schedule.retentionCount,
    lastRunAt: schedule.lastRunAt?.toISOString() ?? null,
    nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
    createdByUserId: schedule.createdByUserId,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export function serializeBackupJob(job: {
  id: string;
  organizationId: string;
  scheduleId: string | null;
  createdByUserId: string | null;
  status: string;
  targets: string[];
  progressPercent: number;
  currentStep: string | null;
  errorMessage: string | null;
  cancelRequested: boolean;
  retryOfJobId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  snapshot?: { id: string } | null;
}): PublicBackupJob {
  return {
    id: job.id,
    organizationId: job.organizationId,
    scheduleId: job.scheduleId,
    createdByUserId: job.createdByUserId,
    status: job.status as BackupJobStatusName,
    targets: job.targets as BackupTargetName[],
    progressPercent: job.progressPercent,
    currentStep: job.currentStep,
    errorMessage: job.errorMessage,
    cancelRequested: job.cancelRequested,
    retryOfJobId: job.retryOfJobId,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    snapshotId: job.snapshot?.id ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function serializeBackupJobLog(log: {
  id: string;
  organizationId: string;
  jobId: string;
  level: string;
  message: string;
  createdAt: Date;
}): PublicBackupJobLog {
  return {
    id: log.id,
    organizationId: log.organizationId,
    jobId: log.jobId,
    level: log.level as BackupLogLevelName,
    message: log.message,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeBackupSnapshot(snapshot: {
  id: string;
  organizationId: string;
  jobId: string;
  scheduleId: string | null;
  storageObjectId: string | null;
  manifestChecksum: string;
  size: bigint;
  verifiedAt: Date | null;
  verificationPassed: boolean;
  verificationError: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicBackupSnapshot {
  return {
    id: snapshot.id,
    organizationId: snapshot.organizationId,
    jobId: snapshot.jobId,
    scheduleId: snapshot.scheduleId,
    storageObjectId: snapshot.storageObjectId,
    manifestChecksum: snapshot.manifestChecksum,
    size: Number(snapshot.size),
    verifiedAt: snapshot.verifiedAt?.toISOString() ?? null,
    verificationPassed: snapshot.verificationPassed,
    verificationError: snapshot.verificationError,
    expiresAt: snapshot.expiresAt?.toISOString() ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
  };
}

export function serializeBackupRestoreJob(job: {
  id: string;
  organizationId: string;
  snapshotId: string;
  createdByUserId: string | null;
  status: string;
  progressPercent: number;
  currentStep: string | null;
  restorePlan: unknown;
  errorMessage: string | null;
  cancelRequested: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicBackupRestoreJob {
  return {
    id: job.id,
    organizationId: job.organizationId,
    snapshotId: job.snapshotId,
    createdByUserId: job.createdByUserId,
    status: job.status as BackupJobStatusName,
    progressPercent: job.progressPercent,
    currentStep: job.currentStep,
    restorePlan: (job.restorePlan as BackupRestorePlan | null) ?? null,
    errorMessage: job.errorMessage,
    cancelRequested: job.cancelRequested,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
