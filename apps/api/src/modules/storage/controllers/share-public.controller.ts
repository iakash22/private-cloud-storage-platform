import {
  inspectShareQuerySchema,
  shareDownloadBodySchema,
  unlockShareBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { BaseController } from '../../../http/base.controller.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { requestMeta } from '../../../lib/audit.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';

export class SharePublicController extends BaseController {
  inspect: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = inspectShareQuerySchema.parse(req.query);
    const result = await this.container.storage.shares.inspect(
      routeParam(req, 'token'),
      req.auth,
      query.accessToken,
      requestMeta(req),
    );
    this.ok(res, result);
  });

  unlock: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = readBody(req, unlockShareBodySchema);
    const result = await this.container.storage.shares.unlock(
      routeParam(req, 'token'),
      body.password,
      req.auth,
    );
    this.ok(res, result);
  });

  createDownloadUrl: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = shareDownloadBodySchema.parse(req.body ?? {});
      const download = await this.container.storage.shares.createDownloadUrl(
        routeParam(req, 'token'),
        req.auth,
        { password: body.password, accessToken: body.accessToken },
        this.container.storage.baseUrl(req),
        requestMeta(req),
      );
      this.ok(res, { download });
    },
  );

  createPreviewUrl: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const body = shareDownloadBodySchema.parse(req.body ?? {});
      const preview = await this.container.storage.shares.createPreviewUrl(
        routeParam(req, 'token'),
        req.auth,
        { password: body.password, accessToken: body.accessToken },
        this.container.storage.baseUrl(req),
        requestMeta(req),
      );
      this.ok(res, { preview });
    },
  );
}
