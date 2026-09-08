-- Phase 11: Backup engine metadata. Archive bytes remain in StorageProvider.

CREATE TYPE "BackupJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "BackupTarget" AS ENUM ('POSTGRESQL', 'MONGODB', 'APP_CONFIG', 'DOCKER_VOLUMES', 'VAULTSTACK_METADATA', 'VAULTSTACK_OBJECT_METADATA');
CREATE TYPE "BackupLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

CREATE TABLE "BackupSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "targets" "BackupTarget"[],
    "intervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "retentionDays" INTEGER,
    "retentionCount" INTEGER,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "createdByUserId" TEXT,
    "status" "BackupJobStatus" NOT NULL DEFAULT 'QUEUED',
    "targets" "BackupTarget"[],
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "retryOfJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "storageObjectId" TEXT,
    "manifestChecksum" TEXT NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "verificationPassed" BOOLEAN NOT NULL DEFAULT false,
    "verificationError" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupJobLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" "BackupLogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupJobLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackupRestoreJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "status" "BackupJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "restorePlan" JSONB,
    "errorMessage" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRestoreJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackupSchedule_organizationId_name_key" ON "BackupSchedule"("organizationId", "name");
CREATE INDEX "BackupSchedule_organizationId_idx" ON "BackupSchedule"("organizationId");
CREATE INDEX "BackupSchedule_enabled_nextRunAt_idx" ON "BackupSchedule"("enabled", "nextRunAt");

CREATE INDEX "BackupJob_organizationId_createdAt_idx" ON "BackupJob"("organizationId", "createdAt");
CREATE INDEX "BackupJob_organizationId_status_idx" ON "BackupJob"("organizationId", "status");
CREATE INDEX "BackupJob_scheduleId_idx" ON "BackupJob"("scheduleId");

CREATE UNIQUE INDEX "BackupSnapshot_jobId_key" ON "BackupSnapshot"("jobId");
CREATE INDEX "BackupSnapshot_organizationId_createdAt_idx" ON "BackupSnapshot"("organizationId", "createdAt");
CREATE INDEX "BackupSnapshot_expiresAt_idx" ON "BackupSnapshot"("expiresAt");

CREATE INDEX "BackupJobLog_jobId_createdAt_idx" ON "BackupJobLog"("jobId", "createdAt");
CREATE INDEX "BackupJobLog_organizationId_idx" ON "BackupJobLog"("organizationId");

CREATE INDEX "BackupRestoreJob_organizationId_createdAt_idx" ON "BackupRestoreJob"("organizationId", "createdAt");
CREATE INDEX "BackupRestoreJob_snapshotId_idx" ON "BackupRestoreJob"("snapshotId");

ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupSchedule" ADD CONSTRAINT "BackupSchedule_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BackupSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackupJob" ADD CONSTRAINT "BackupJob_retryOfJobId_fkey" FOREIGN KEY ("retryOfJobId") REFERENCES "BackupJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BackupSnapshot" ADD CONSTRAINT "BackupSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupSnapshot" ADD CONSTRAINT "BackupSnapshot_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackupJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupSnapshot" ADD CONSTRAINT "BackupSnapshot_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "BackupSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackupSnapshot" ADD CONSTRAINT "BackupSnapshot_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BackupJobLog" ADD CONSTRAINT "BackupJobLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupJobLog" ADD CONSTRAINT "BackupJobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackupJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BackupRestoreJob" ADD CONSTRAINT "BackupRestoreJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackupRestoreJob" ADD CONSTRAINT "BackupRestoreJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BackupSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BackupRestoreJob" ADD CONSTRAINT "BackupRestoreJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
