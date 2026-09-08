import {
  backupJobIdParamsSchema,
  backupRestoreIdParamsSchema,
  backupScheduleIdParamsSchema,
  backupSnapshotIdParamsSchema,
  createBackupJobBodySchema,
  createBackupRestoreBodySchema,
  createBackupScheduleBodySchema,
  updateBackupScheduleBodySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { BackupsController } from './controllers/backups.controller.js';

/**
 * Backup control plane. Organization is resolved from auth context.
 * Archive bytes are stored through StorageService, not a second engine.
 */
export function createBackupsRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new BackupsController(container);

  router.use(requireOrganizationContext);

  router.get('/summary', controller.allow(BackupsController.readPermission), controller.summary);

  router.get(
    '/schedules',
    controller.allow(BackupsController.readPermission),
    controller.listSchedules,
  );
  router.post(
    '/schedules',
    validateBody(createBackupScheduleBodySchema),
    controller.allow(BackupsController.createPermission),
    controller.createSchedule,
  );
  router.get(
    '/schedules/:scheduleId',
    validateParams(backupScheduleIdParamsSchema),
    controller.allow(BackupsController.readPermission),
    controller.getSchedule,
  );
  router.patch(
    '/schedules/:scheduleId',
    validateParams(backupScheduleIdParamsSchema),
    validateBody(updateBackupScheduleBodySchema),
    controller.allow(BackupsController.createPermission),
    controller.updateSchedule,
  );
  router.delete(
    '/schedules/:scheduleId',
    validateParams(backupScheduleIdParamsSchema),
    controller.allow(BackupsController.deletePermission),
    controller.deleteSchedule,
  );

  router.get('/jobs', controller.allow(BackupsController.readPermission), controller.listJobs);
  router.post(
    '/jobs',
    validateBody(createBackupJobBodySchema),
    controller.allow(BackupsController.createPermission),
    controller.createJob,
  );
  router.get(
    '/jobs/:jobId',
    validateParams(backupJobIdParamsSchema),
    controller.allow(BackupsController.readPermission),
    controller.getJob,
  );
  router.get(
    '/jobs/:jobId/logs',
    validateParams(backupJobIdParamsSchema),
    controller.allow(BackupsController.readPermission),
    controller.listJobLogs,
  );
  router.post(
    '/jobs/:jobId/cancel',
    validateParams(backupJobIdParamsSchema),
    controller.allow(BackupsController.createPermission),
    controller.cancelJob,
  );
  router.post(
    '/jobs/:jobId/retry',
    validateParams(backupJobIdParamsSchema),
    controller.allow(BackupsController.createPermission),
    controller.retryJob,
  );

  router.get(
    '/snapshots',
    controller.allow(BackupsController.readPermission),
    controller.listSnapshots,
  );
  router.get(
    '/snapshots/:snapshotId',
    validateParams(backupSnapshotIdParamsSchema),
    controller.allow(BackupsController.readPermission),
    controller.getSnapshot,
  );
  router.delete(
    '/snapshots/:snapshotId',
    validateParams(backupSnapshotIdParamsSchema),
    controller.allow(BackupsController.deletePermission),
    controller.deleteSnapshot,
  );
  router.post(
    '/snapshots/:snapshotId/verify',
    validateParams(backupSnapshotIdParamsSchema),
    controller.allow(BackupsController.createPermission),
    controller.verifySnapshot,
  );
  router.post(
    '/snapshots/:snapshotId/restore',
    validateParams(backupSnapshotIdParamsSchema),
    controller.allow(BackupsController.restorePermission),
    controller.restoreSnapshot,
  );

  router.get(
    '/restore',
    controller.allow(BackupsController.restorePermission),
    controller.listRestores,
  );
  router.post(
    '/restore',
    validateBody(createBackupRestoreBodySchema),
    controller.allow(BackupsController.restorePermission),
    controller.createRestore,
  );
  router.get(
    '/restore/:restoreId',
    validateParams(backupRestoreIdParamsSchema),
    controller.allow(BackupsController.restorePermission),
    controller.getRestore,
  );

  return router;
}
