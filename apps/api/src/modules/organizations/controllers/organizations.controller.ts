import {
  createOrganizationBodySchema,
  updateOrganizationBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { PERMISSIONS } from '@vaultstack/types';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';

export class OrganizationsController extends OrganizationScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const organizations = await this.container.organizations.listForUser(auth.user.id);
    this.ok(res, { organizations });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const organization = await this.container.organizations.create(
      auth.user.id,
      readBody(req, createOrganizationBodySchema).name,
      requestMeta(req),
    );
    this.created(res, { organization });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const organization = await this.container.organizations.getById(
      routeParam(req, 'organizationId'),
    );
    this.ok(res, { organization });
  });

  update: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const organization = await this.container.organizations.update(
      routeParam(req, 'organizationId'),
      readBody(req, updateOrganizationBodySchema).name,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { organization });
  });

  static readonly readPermission = PERMISSIONS.USERS_READ;
  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
