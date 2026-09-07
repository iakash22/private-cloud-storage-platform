import { createApiKeyBodySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class ApiKeysController extends OrganizationScopedController {
  constructor(container: AppContainer) {
    super(container);
  }

  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const apiKeys = await this.container.apiKeys.list(routeParam(req, 'organizationId'));
    this.ok(res, { apiKeys });
  });

  create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const apiKey = await this.container.apiKeys.create(
      routeParam(req, 'organizationId'),
      auth.user.id,
      readBody(req, createApiKeyBodySchema),
      requestMeta(req),
    );
    this.created(res, { apiKey });
  });

  revoke = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const apiKey = await this.container.apiKeys.revoke(
      routeParam(req, 'organizationId'),
      routeParam(req, 'apiKeyId'),
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { apiKey });
  });

  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
