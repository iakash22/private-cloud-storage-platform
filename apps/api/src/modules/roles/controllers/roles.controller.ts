import {
  createRoleBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class RolesController extends OrganizationScopedController {
  constructor(container: AppContainer) {
    super(container);
  }

  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const roles = await this.container.roles.list(routeParam(req, 'organizationId'));
    this.ok(res, { roles });
  });

  create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const role = await this.container.roles.create(
      routeParam(req, 'organizationId'),
      readBody(req, createRoleBodySchema),
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { role });
  });

  get = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const role = await this.container.roles.get(
      routeParam(req, 'organizationId'),
      routeParam(req, 'roleId'),
    );
    this.ok(res, { role });
  });

  static readonly readPermission = PERMISSIONS.USERS_READ;
  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
