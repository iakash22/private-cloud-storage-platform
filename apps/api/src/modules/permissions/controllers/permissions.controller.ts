import type { Request, Response } from 'express';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { AuthenticatedController } from '../../../http/base.controller.js';

export class PermissionsController extends AuthenticatedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    this.requireAuth(req);
    const permissions = await this.container.permissions.list();
    this.ok(res, { permissions });
  });
}
