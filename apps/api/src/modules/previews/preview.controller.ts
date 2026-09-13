import { createPreviewBodySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { asyncHandler, type AsyncRouteHandler } from '../../lib/async-handler.js';
import { routeParam } from '../../lib/route-param.js';
import { readBody } from '../../middleware/validate.js';
import { StorageScopedController } from '../../http/storage-scoped.controller.js';
import type { AppContainer } from '../../container/app-container.js';

export class PreviewController extends StorageScopedController {
  constructor(private readonly app: AppContainer) {
    super(app);
  }

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const body = readBody(req, createPreviewBodySchema);
    const job = await this.app.previews.create(
      this.organizationId(req),
      routeParam(req, 'objectId'),
      body.kind,
    );
    res.status(202).json({ job });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const job = await this.app.previews.get(this.organizationId(req), routeParam(req, 'jobId'));
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Preview job not found' } });
      return;
    }
    this.ok(res, { job });
  });
}
