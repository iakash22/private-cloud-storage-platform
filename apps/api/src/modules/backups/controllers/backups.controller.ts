import {
  createBackupJobBodySchema,
  createBackupRestoreBodySchema,
  createBackupScheduleBodySchema,
  updateBackupScheduleBodySchema,
} from '@vaultstack/validation';
import type { Request, RequestHandler, Response } from 'express';
import { PERMISSIONS, type PermissionKey } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { createRequireOrganizationPermission } from '../../../middleware/authorize.js';
import { currentOrganizationId } from '../../../middleware/organization-context.js';
import { readBody } from '../../../middleware/validate.js';
import { AuthenticatedController } from '../../../http/base.controller.js';

export class BackupsController extends AuthenticatedController {
  static readonly readPermission = PERMISSIONS.BACKUP_READ;
  static readonly createPermission = PERMISSIONS.BACKUP_CREATE;
  static readonly deletePermission = PERMISSIONS.BACKUP_DELETE;
  static readonly restorePermission = PERMISSIONS.BACKUP_RESTORE;

  protected organizationId(req: Request): string {
    return currentOrganizationId(req);
  }

  allow(permission: PermissionKey): RequestHandler {
    return createRequireOrganizationPermission(this.container.authorization, permission);
  }

  summary: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const summary = await this.container.backups.summary(this.organizationId(req));
    this.ok(res, { summary });
  });

  listSchedules: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const schedules = await this.container.backups.listSchedules(this.organizationId(req));
    this.ok(res, { schedules });
  });

  createSchedule: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createBackupScheduleBodySchema);
    const schedule = await this.container.backups.createSchedule(
      this.organizationId(req),
      auth.user.id,
      body,
      requestMeta(req),
    );
    this.created(res, { schedule });
  });

  getSchedule: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const schedule = await this.container.backups.getSchedule(
      this.organizationId(req),
      routeParam(req, 'scheduleId'),
    );
    this.ok(res, { schedule });
  });

  updateSchedule: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, updateBackupScheduleBodySchema);
    const schedule = await this.container.backups.updateSchedule(
      this.organizationId(req),
      routeParam(req, 'scheduleId'),
      auth.user.id,
      body,
      requestMeta(req),
    );
    this.ok(res, { schedule });
  });

  deleteSchedule: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.backups.deleteSchedule(
      this.organizationId(req),
      routeParam(req, 'scheduleId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  listJobs: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const jobs = await this.container.backups.listJobs(this.organizationId(req));
    this.ok(res, { jobs });
  });

  createJob: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createBackupJobBodySchema);
    const job = await this.container.backups.createJob(
      this.organizationId(req),
      auth.user.id,
      body,
      requestMeta(req),
    );
    this.created(res, { job });
  });

  getJob: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const job = await this.container.backups.getJob(
      this.organizationId(req),
      routeParam(req, 'jobId'),
    );
    this.ok(res, { job });
  });

  listJobLogs: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const logs = await this.container.backups.listJobLogs(
      this.organizationId(req),
      routeParam(req, 'jobId'),
    );
    this.ok(res, { logs });
  });

  cancelJob: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const job = await this.container.backups.cancelJob(
      this.organizationId(req),
      routeParam(req, 'jobId'),
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { job });
  });

  retryJob: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const job = await this.container.backups.retryJob(
      this.organizationId(req),
      routeParam(req, 'jobId'),
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { job });
  });

  listSnapshots: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const snapshots = await this.container.backups.listSnapshots(this.organizationId(req));
    this.ok(res, { snapshots });
  });

  getSnapshot: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const snapshot = await this.container.backups.getSnapshot(
      this.organizationId(req),
      routeParam(req, 'snapshotId'),
    );
    this.ok(res, { snapshot });
  });

  deleteSnapshot: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.backups.deleteSnapshot(
      this.organizationId(req),
      routeParam(req, 'snapshotId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  verifySnapshot: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.container.backups.verifySnapshot(
      this.organizationId(req),
      routeParam(req, 'snapshotId'),
    );
    this.ok(res, result);
  });

  restoreSnapshot: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const restore = await this.container.backups.createRestore(
      this.organizationId(req),
      auth.user.id,
      routeParam(req, 'snapshotId'),
      requestMeta(req),
    );
    this.created(res, { restore });
  });

  listRestores: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const restores = await this.container.backups.listRestores(this.organizationId(req));
    this.ok(res, { restores });
  });

  createRestore: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createBackupRestoreBodySchema);
    const restore = await this.container.backups.createRestore(
      this.organizationId(req),
      auth.user.id,
      body.snapshotId,
      requestMeta(req),
    );
    this.created(res, { restore });
  });

  getRestore: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const restore = await this.container.backups.getRestore(
      this.organizationId(req),
      routeParam(req, 'restoreId'),
    );
    this.ok(res, { restore });
  });
}
