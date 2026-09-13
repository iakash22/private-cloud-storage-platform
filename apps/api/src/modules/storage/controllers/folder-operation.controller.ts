import { createFolderOperationBodySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class FolderOperationController extends StorageScopedController {
  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createFolderOperationBodySchema);
    const job = await this.container.folderOperations.create({
      organizationId: this.organizationId(req),
      bucketId: body.bucketId,
      operation: body.operation,
      sourcePrefix: body.sourcePrefix,
      destinationPrefix: body.destinationPrefix,
      userId: auth.user.id,
      meta: requestMeta(req),
    });
    this.created(res, { job });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const job = await this.container.folderOperations.get(
      this.organizationId(req),
      routeParam(req, 'jobId'),
    );
    if (!job) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Folder operation not found' },
      });
      return;
    }
    this.ok(res, { job });
  });

  cancel: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    await this.container.folderOperations.cancel(
      this.organizationId(req),
      routeParam(req, 'jobId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  retry: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const job = await this.container.folderOperations.retry(
      this.organizationId(req),
      routeParam(req, 'jobId'),
    );
    this.ok(res, { job });
  });
}
