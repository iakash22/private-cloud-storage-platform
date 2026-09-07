import {
  assignRoleBodySchema,
  createUserBodySchema,
  updateUserBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';

export class UsersController extends OrganizationScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const users = await this.container.users.list(routeParam(req, 'organizationId'));
    this.ok(res, { users });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const user = await this.container.users.create(
      routeParam(req, 'organizationId'),
      readBody(req, createUserBodySchema),
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { user });
  });

  get: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const user = await this.container.users.getInOrganization(
      routeParam(req, 'organizationId'),
      routeParam(req, 'userId'),
    );
    this.ok(res, { user });
  });

  update: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const user = await this.container.users.update(
      routeParam(req, 'organizationId'),
      routeParam(req, 'userId'),
      readBody(req, updateUserBodySchema),
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { user });
  });

  assignRole: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.roles.assign(
      routeParam(req, 'organizationId'),
      routeParam(req, 'userId'),
      readBody(req, assignRoleBodySchema).roleId,
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  unassignRole: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.roles.unassign(
      routeParam(req, 'organizationId'),
      routeParam(req, 'userId'),
      routeParam(req, 'roleId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  static readonly readPermission = PERMISSIONS.USERS_READ;
  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
