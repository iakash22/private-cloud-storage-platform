import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { EnvConfig } from '@vaultstack/config';
import { BackupJobStatus, BackupLogLevel, Prisma, type PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type {
  BackupLogLevelName,
  BackupTargetName,
  PublicBackupVerification,
} from '@vaultstack/types';
import { AppError } from '../../../lib/errors.js';
import { backupJobNotFound, backupSnapshotNotFound } from '../../../lib/errors.js';
import type { StorageModule } from '../../storage/storage.module.js';
import { createGzipTarFromDirectory, sha256File, walkFiles } from '../domain/archive.js';
import { BackupCancelledError } from '../domain/cancelled.js';
import { BACKUP_MANIFEST_VERSION, BACKUPS_BUCKET_NAME } from '../domain/constants.js';
import { writeJsonFile, writeTextFile } from '../domain/redact.js';
import { serializeBackupSnapshot } from '../mappers/backups.mapper.js';
import type { BackupTargetAdapter } from '../targets/target.types.js';
import { createDefaultTargetRegistry } from '../targets/target-registry.js';
import {
  BackupVerificationError,
  buildRestorePlan,
  type BackupManifest,
  verifyArchiveFile,
} from './backup-verifier.js';
import type { NotificationService } from '../../notifications/notification.service.js';
import type { RealtimePublisher } from '../../realtime/services/redis-realtime.publisher.js';
import { publishBackupJobEvent } from '../../realtime/realtime-events.js';

export interface BackupEngineSideEffects {
  notifications?: NotificationService;
  realtimePublisher?: RealtimePublisher;
}

export class BackupEngine {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageModule,
    private readonly config: EnvConfig,
    private readonly logger: Logger,
    private readonly registry: Record<
      BackupTargetName,
      BackupTargetAdapter
    > = createDefaultTargetRegistry(),
    private readonly sideEffects: BackupEngineSideEffects = {},
  ) {}

  async runJob(jobId: string): Promise<void> {
    const job = await this.prisma.backupJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw backupJobNotFound();
    }

    if (job.status === BackupJobStatus.CANCELLED || job.cancelRequested) {
      await this.markCancelled(job.id, job.organizationId);
      return;
    }

    if (job.status !== BackupJobStatus.QUEUED && job.status !== BackupJobStatus.FAILED) {
      return;
    }

    const running = await this.prisma.backupJob.update({
      where: { id: job.id },
      data: {
        status: BackupJobStatus.RUNNING,
        startedAt: new Date(),
        progressPercent: 5,
        currentStep: 'collecting',
        errorMessage: null,
      },
    });
    await this.emitBackupJobUpdate(running, 'backup_job.progress');
    await this.appendLog(job.organizationId, job.id, BackupLogLevel.INFO, 'Backup started');

    const root = this.config.BACKUP_TEMP_DIR ?? join(tmpdir(), 'vaultstack-backups');
    await mkdir(root, { recursive: true });
    const workDir = await mkdtemp(join(root, `job-${job.id}-`));
    const bundleDir = join(workDir, 'bundle');
    await mkdir(bundleDir, { recursive: true });

    try {
      await this.throwIfCancelled(job.id);
      const targets = job.targets;
      const perTarget = Math.max(1, Math.floor(50 / Math.max(targets.length, 1)));

      for (const [index, target] of targets.entries()) {
        await this.throwIfCancelled(job.id);
        const adapter = this.registry[target];
        await this.appendLog(
          job.organizationId,
          job.id,
          BackupLogLevel.INFO,
          `Collecting target ${target}`,
        );
        const result = await adapter.collect({
          organizationId: job.organizationId,
          jobId: job.id,
          workDir: bundleDir,
          prisma: this.prisma,
          config: this.config,
          logger: this.logger,
          log: (level, message) => this.appendLog(job.organizationId, job.id, level, message),
        });
        await this.prisma.backupJob.update({
          where: { id: job.id },
          data: {
            progressPercent: Math.min(55, 10 + (index + 1) * perTarget),
            currentStep: `collected:${target}`,
          },
        });
        if (result.status === 'skipped') {
          await this.appendLog(
            job.organizationId,
            job.id,
            BackupLogLevel.WARN,
            result.notes ?? `${target} skipped`,
          );
        }
      }

      await this.throwIfCancelled(job.id);
      const discovered = await walkFiles(bundleDir);
      const files: BackupManifest['files'] = [];
      for (const full of discovered) {
        const relative = full
          .slice(bundleDir.length + 1)
          .split(/[\\/]/)
          .join('/');
        const info = await stat(full);
        files.push({
          path: relative,
          sha256: await sha256File(full),
          size: info.size,
        });
      }

      const manifest: BackupManifest = {
        version: BACKUP_MANIFEST_VERSION,
        organizationId: job.organizationId,
        jobId: job.id,
        targets,
        createdAt: new Date().toISOString(),
        files,
      };
      await writeJsonFile(join(bundleDir, 'manifest.json'), manifest);
      await writeTextFile(
        join(bundleDir, 'checksum.sha256'),
        files.map((file) => `${file.sha256}  ${file.path}`).join('\n') + '\n',
      );

      await this.prisma.backupJob.update({
        where: { id: job.id },
        data: { progressPercent: 65, currentStep: 'packaging' },
      });

      const archivePath = join(workDir, 'backup.tar.gz');
      const packed = await createGzipTarFromDirectory(bundleDir, archivePath);

      await this.throwIfCancelled(job.id);
      await this.prisma.backupJob.update({
        where: { id: job.id },
        data: { status: BackupJobStatus.VERIFYING, progressPercent: 80, currentStep: 'uploading' },
      });

      const bucket = await this.ensureBackupsBucket(job.organizationId, job.createdByUserId);
      const stored = await this.storage.objects.put({
        organizationId: job.organizationId,
        bucketId: bucket.id,
        key: `jobs/${job.id}/backup.tar.gz`,
        body: createReadStream(archivePath),
        contentType: 'application/gzip',
        expectedSize: packed.size,
        expectedChecksumSha256: packed.sha256,
        userId: job.createdByUserId,
      });

      await this.appendLog(
        job.organizationId,
        job.id,
        BackupLogLevel.INFO,
        'Archive uploaded; verifying checksums',
      );
      await verifyArchiveFile(archivePath, packed.sha256);

      const schedule = job.scheduleId
        ? await this.prisma.backupSchedule.findUnique({ where: { id: job.scheduleId } })
        : null;
      const expiresAt =
        schedule?.retentionDays != null
          ? new Date(Date.now() + schedule.retentionDays * 24 * 60 * 60 * 1000)
          : null;

      await this.prisma.backupSnapshot.create({
        data: {
          organizationId: job.organizationId,
          jobId: job.id,
          scheduleId: job.scheduleId,
          storageObjectId: stored.id,
          manifestChecksum: packed.sha256,
          size: BigInt(packed.size),
          verifiedAt: new Date(),
          verificationPassed: true,
          expiresAt,
        },
      });

      const completed = await this.prisma.backupJob.update({
        where: { id: job.id },
        data: {
          status: BackupJobStatus.COMPLETED,
          progressPercent: 100,
          currentStep: 'completed',
          finishedAt: new Date(),
        },
      });
      await this.emitBackupJobUpdate(completed, 'backup_job.completed');
      await this.appendLog(job.organizationId, job.id, BackupLogLevel.INFO, 'Backup completed');
    } catch (error) {
      if (error instanceof BackupCancelledError) {
        await this.markCancelled(job.id, job.organizationId);
        return;
      }
      const message = error instanceof Error ? error.message : 'Backup failed';
      this.logger.error({ err: error, jobId: job.id }, 'Backup job failed');
      await this.appendLog(job.organizationId, job.id, BackupLogLevel.ERROR, message);
      const failed = await this.prisma.backupJob.update({
        where: { id: job.id },
        data: {
          status: BackupJobStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
          currentStep: 'failed',
        },
      });
      await this.emitBackupJobUpdate(failed, 'backup_job.failed');
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async verifySnapshot(
    organizationId: string,
    snapshotId: string,
  ): Promise<PublicBackupVerification> {
    const snapshot = await this.requireSnapshot(organizationId, snapshotId);
    if (!snapshot.storageObjectId) {
      await this.prisma.backupSnapshot.update({
        where: { id: snapshot.id },
        data: {
          verificationPassed: false,
          verificationError: 'Snapshot has no storage object',
          verifiedAt: new Date(),
        },
      });
      throw new BackupVerificationError('Snapshot has no storage object');
    }

    const root = this.config.BACKUP_TEMP_DIR ?? join(tmpdir(), 'vaultstack-backups');
    await mkdir(root, { recursive: true });
    const workDir = await mkdtemp(join(root, `verify-${snapshot.id}-`));
    const archivePath = join(workDir, 'backup.tar.gz');

    try {
      const download = await this.storage.objects.openDownload(
        organizationId,
        snapshot.storageObjectId,
      );
      await pipeline(download.stream.body, createWriteStream(archivePath));
      await verifyArchiveFile(archivePath, snapshot.manifestChecksum);
      const updated = await this.prisma.backupSnapshot.update({
        where: { id: snapshot.id },
        data: {
          verificationPassed: true,
          verificationError: null,
          verifiedAt: new Date(),
        },
      });
      return { snapshot: serializeBackupSnapshot(updated), passed: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      const updated = await this.prisma.backupSnapshot.update({
        where: { id: snapshot.id },
        data: {
          verificationPassed: false,
          verificationError: message,
          verifiedAt: new Date(),
        },
      });
      return { snapshot: serializeBackupSnapshot(updated), passed: false, error: message };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async runRestore(restoreJobId: string): Promise<void> {
    const restore = await this.prisma.backupRestoreJob.findUnique({ where: { id: restoreJobId } });
    if (!restore) {
      return;
    }

    if (restore.cancelRequested) {
      await this.prisma.backupRestoreJob.update({
        where: { id: restore.id },
        data: {
          status: BackupJobStatus.CANCELLED,
          finishedAt: new Date(),
          currentStep: 'cancelled',
        },
      });
      return;
    }

    await this.prisma.backupRestoreJob.update({
      where: { id: restore.id },
      data: {
        status: BackupJobStatus.RUNNING,
        startedAt: new Date(),
        progressPercent: 10,
        currentStep: 'loading-snapshot',
      },
    });

    try {
      const verification = await this.verifySnapshot(restore.organizationId, restore.snapshotId);
      if (!verification.passed) {
        throw new BackupVerificationError(verification.error ?? 'Snapshot failed verification');
      }

      const snapshot = await this.requireSnapshot(restore.organizationId, restore.snapshotId);
      const job = await this.prisma.backupJob.findUnique({ where: { id: snapshot.jobId } });
      const manifest: BackupManifest = {
        version: BACKUP_MANIFEST_VERSION,
        organizationId: snapshot.organizationId,
        jobId: snapshot.jobId,
        targets: job?.targets ?? [],
        createdAt: snapshot.createdAt.toISOString(),
        files: [],
      };

      const root = this.config.BACKUP_TEMP_DIR ?? join(tmpdir(), 'vaultstack-backups');
      await mkdir(root, { recursive: true });
      const workDir = await mkdtemp(join(root, `restore-${restore.id}-`));
      try {
        if (snapshot.storageObjectId) {
          const archivePath = join(workDir, 'backup.tar.gz');
          const download = await this.storage.objects.openDownload(
            restore.organizationId,
            snapshot.storageObjectId,
          );
          await pipeline(download.stream.body, createWriteStream(archivePath));
          const verified = await verifyArchiveFile(archivePath, snapshot.manifestChecksum);
          const plan = buildRestorePlan(verified, snapshot.id);
          await this.prisma.backupRestoreJob.update({
            where: { id: restore.id },
            data: {
              status: BackupJobStatus.COMPLETED,
              progressPercent: 100,
              currentStep: 'plan-ready',
              restorePlan: JSON.parse(JSON.stringify(plan)) as Prisma.InputJsonValue,
              finishedAt: new Date(),
            },
          });
          return;
        }
        const plan = buildRestorePlan(manifest, snapshot.id);
        await this.prisma.backupRestoreJob.update({
          where: { id: restore.id },
          data: {
            status: BackupJobStatus.COMPLETED,
            progressPercent: 100,
            currentStep: 'plan-ready',
            restorePlan: JSON.parse(JSON.stringify(plan)) as Prisma.InputJsonValue,
            finishedAt: new Date(),
          },
        });
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Restore planning failed';
      await this.prisma.backupRestoreJob.update({
        where: { id: restore.id },
        data: {
          status: BackupJobStatus.FAILED,
          errorMessage: message,
          finishedAt: new Date(),
          currentStep: 'failed',
        },
      });
    }
  }

  private async throwIfCancelled(jobId: string): Promise<void> {
    const current = await this.prisma.backupJob.findUnique({
      where: { id: jobId },
      select: { cancelRequested: true, status: true },
    });
    if (!current || current.cancelRequested || current.status === BackupJobStatus.CANCELLED) {
      throw new BackupCancelledError();
    }
  }

  private async markCancelled(jobId: string, organizationId: string): Promise<void> {
    await this.prisma.backupJob.update({
      where: { id: jobId },
      data: {
        status: BackupJobStatus.CANCELLED,
        finishedAt: new Date(),
        currentStep: 'cancelled',
        progressPercent: 0,
      },
    });
    await this.appendLog(organizationId, jobId, BackupLogLevel.INFO, 'Backup cancelled');
  }

  private async appendLog(
    organizationId: string,
    jobId: string,
    level: BackupLogLevelName,
    message: string,
  ): Promise<void> {
    await this.prisma.backupJobLog.create({
      data: { organizationId, jobId, level, message },
    });
  }

  private async emitBackupJobUpdate(
    job: {
      id: string;
      organizationId: string;
      createdByUserId: string | null;
      status: BackupJobStatus;
      progressPercent: number;
      currentStep: string | null;
      errorMessage: string | null;
    },
    type: 'backup_job.progress' | 'backup_job.completed' | 'backup_job.failed',
  ): Promise<void> {
    const userId = job.createdByUserId;
    if (!userId) {
      return;
    }

    const payload = {
      jobId: job.id,
      status: job.status as 'QUEUED' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
      progressPercent: job.progressPercent,
      currentStep: job.currentStep,
      errorMessage: job.errorMessage,
    };

    if (this.sideEffects.realtimePublisher) {
      await publishBackupJobEvent(this.sideEffects.realtimePublisher, {
        organizationId: job.organizationId,
        userId,
        type,
        payload,
      });
    }

    if (!this.sideEffects.notifications) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) {
      return;
    }

    const jobLabel = job.currentStep ? `Backup (${job.currentStep})` : `Backup ${job.id.slice(0, 8)}`;

    if (type === 'backup_job.completed') {
      this.sideEffects.notifications.notifyBackupJobCompleted({
        to: user.email,
        recipientName: user.name,
        jobName: jobLabel,
      });
      return;
    }

    if (type === 'backup_job.failed') {
      this.sideEffects.notifications.notifyBackupJobFailed({
        to: user.email,
        recipientName: user.name,
        jobName: jobLabel,
        error: job.errorMessage ?? 'Backup failed',
      });
    }
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

  private async ensureBackupsBucket(
    organizationId: string,
    userId: string | null,
  ): Promise<{ id: string }> {
    try {
      return await this.storage.buckets.getByName(organizationId, BACKUPS_BUCKET_NAME);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'STORAGE_BUCKET_NOT_FOUND') {
        throw error;
      }
    }

    try {
      return await this.storage.buckets.create(
        organizationId,
        userId ?? 'system',
        { name: BACKUPS_BUCKET_NAME },
        {},
      );
    } catch (error) {
      if (error instanceof AppError && error.code === 'CONFLICT') {
        return this.storage.buckets.getByName(organizationId, BACKUPS_BUCKET_NAME);
      }
      throw error;
    }
  }
}
