import {
  createStorageProviderBodySchema,
  updateStorageProviderBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { StorageScopedController } from '../../../http/storage-scoped.controller.js';
import { readBody } from '../../../middleware/validate.js';

export class ProviderController extends StorageScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const providers = await this.container.storage.providers.list(this.organizationId(req));
    this.ok(res, { providers });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, createStorageProviderBodySchema);
    const provider = await this.container.storage.providers.create(
      this.organizationId(req),
      auth.user.id,
      body,
      requestMeta(req),
    );
    this.created(res, { provider });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const provider = await this.container.storage.providers.get(
      this.organizationId(req),
      routeParam(req, 'providerId'),
    );
    this.ok(res, { provider });
  });

  update: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const body = readBody(req, updateStorageProviderBodySchema);
    const provider = await this.container.storage.providers.update(
      this.organizationId(req),
      routeParam(req, 'providerId'),
      auth.user.id,
      body,
      requestMeta(req),
    );
    this.ok(res, { provider });
  });

  remove: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.storage.providers.remove(
      this.organizationId(req),
      routeParam(req, 'providerId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  test: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const health = await this.container.storage.providers.testConnection(
      this.organizationId(req),
      routeParam(req, 'providerId'),
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { health });
  });
}
