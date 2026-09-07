import {
  createTeamBodySchema,
  updateTeamBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class TeamsController extends OrganizationScopedController {
  constructor(container: AppContainer) {
    super(container);
  }

  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const teams = await this.container.teams.list(routeParam(req, 'organizationId'));
    this.ok(res, { teams });
  });

  create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const team = await this.container.teams.create(
      routeParam(req, 'organizationId'),
      readBody(req, createTeamBodySchema).name,
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { team });
  });

  get = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const team = await this.container.teams.get(
      routeParam(req, 'organizationId'),
      routeParam(req, 'teamId'),
    );
    this.ok(res, { team });
  });

  update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const team = await this.container.teams.update(
      routeParam(req, 'organizationId'),
      routeParam(req, 'teamId'),
      readBody(req, updateTeamBodySchema).name,
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { team });
  });

  remove = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.teams.remove(
      routeParam(req, 'organizationId'),
      routeParam(req, 'teamId'),
      auth.user.id,
      requestMeta(req),
    );
    this.noContent(res);
  });

  static readonly readPermission = PERMISSIONS.USERS_READ;
  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
