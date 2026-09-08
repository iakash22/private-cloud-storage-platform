import {
  createShareBodySchema,
  listSharesQuerySchema,
  updateShareBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class ShareController extends StorageScopedController {
  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createShareBodySchema);
    const share = await this.container.storage.shares.create(
      this.organizationId(req),
      routeParam(req, 'objectId'),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { share });
  });

  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = listSharesQuerySchema.parse(req.query);
    const shares = await this.container.storage.shares.list(
      this.organizationId(req),
      query.objectId,
    );
    this.ok(res, { shares });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const share = await this.container.storage.shares.get(
      this.organizationId(req),
      routeParam(req, 'shareId'),
    );
    this.ok(res, { share });
  });

  update: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, updateShareBodySchema);
    const share = await this.container.storage.shares.update(
      this.organizationId(req),
      routeParam(req, 'shareId'),
      body,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { share });
  });

  revoke: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.shares.revoke(
      this.organizationId(req),
      routeParam(req, 'shareId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });
}
