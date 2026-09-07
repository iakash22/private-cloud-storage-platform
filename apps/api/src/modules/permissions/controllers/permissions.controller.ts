import type { Request, Response } from 'express';
import { asyncHandler } from '../../../lib/async-handler.js';
import { AuthenticatedController } from '../../../http/base.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class PermissionsController extends AuthenticatedController {
  constructor(container: AppContainer) {
    super(container);
  }

  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    this.requireAuth(req);
    const permissions = await this.container.permissions.list();
    this.ok(res, { permissions });
  });
}
