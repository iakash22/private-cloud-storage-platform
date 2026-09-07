import {
  createRoleBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';

export class RolesController extends OrganizationScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const roles = await this.container.roles.list(routeParam(req, 'organizationId'));
    this.ok(res, { roles });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const role = await this.container.roles.create(
      routeParam(req, 'organizationId'),
      readBody(req, createRoleBodySchema),
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { role });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const role = await this.container.roles.get(
      routeParam(req, 'organizationId'),
      routeParam(req, 'roleId'),
    );
    this.ok(res, { role });
  });

  static readonly readPermission = PERMISSIONS.USERS_READ;
  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
