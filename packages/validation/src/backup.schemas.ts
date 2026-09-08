import { z } from 'zod';

export const BACKUP_JOB_STATUS_VALUES = [
  'QUEUED',
  'RUNNING',
  'VERIFYING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export const BACKUP_TARGET_VALUES = [
  'POSTGRESQL',
  'MONGODB',
  'APP_CONFIG',
  'DOCKER_VOLUMES',
  'VAULTSTACK_METADATA',
  'VAULTSTACK_OBJECT_METADATA',
] as const;

export const backupJobStatusSchema = z.enum(BACKUP_JOB_STATUS_VALUES);
export const backupTargetSchema = z.enum(BACKUP_TARGET_VALUES);

export const backupTargetsSchema = z
  .array(backupTargetSchema)
  .min(1)
  .max(BACKUP_TARGET_VALUES.length);

export const backupRetentionDaysSchema = z.number().int().min(1).max(3650);
export const backupRetentionCountSchema = z.number().int().min(1).max(1000);
export const backupIntervalMinutesSchema = z.number().int().min(1).max(525_600);

export const createBackupJobBodySchema = z
  .object({
    targets: backupTargetsSchema,
    scheduleId: z.string().min(1).optional(),
  })
  .strict();

export const createBackupScheduleBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    targets: backupTargetsSchema,
    enabled: z.boolean().optional(),
    intervalMinutes: backupIntervalMinutesSchema.optional(),
    retentionDays: backupRetentionDaysSchema.nullable().optional(),
    retentionCount: backupRetentionCountSchema.nullable().optional(),
  })
  .strict();

export const updateBackupScheduleBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    targets: backupTargetsSchema.optional(),
    enabled: z.boolean().optional(),
    intervalMinutes: backupIntervalMinutesSchema.optional(),
    retentionDays: backupRetentionDaysSchema.nullable().optional(),
    retentionCount: backupRetentionCountSchema.nullable().optional(),
  })
  .strict();

export const backupScheduleIdParamsSchema = z
  .object({
    scheduleId: z.string().min(1),
  })
  .strict();

export const backupJobIdParamsSchema = z
  .object({
    jobId: z.string().min(1),
  })
  .strict();

export const backupSnapshotIdParamsSchema = z
  .object({
    snapshotId: z.string().min(1),
  })
  .strict();

export const backupRestoreIdParamsSchema = z
  .object({
    restoreId: z.string().min(1),
  })
  .strict();

export const createBackupRestoreBodySchema = z
  .object({
    snapshotId: z.string().min(1),
  })
  .strict();

export type CreateBackupJobBody = z.infer<typeof createBackupJobBodySchema>;
export type CreateBackupScheduleBody = z.infer<typeof createBackupScheduleBodySchema>;
export type UpdateBackupScheduleBody = z.infer<typeof updateBackupScheduleBodySchema>;
export type CreateBackupRestoreBody = z.infer<typeof createBackupRestoreBodySchema>;
