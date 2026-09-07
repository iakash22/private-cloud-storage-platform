import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { createS3CredentialBodySchema } from '@vaultstack/validation';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { readBody } from '../../../middleware/validate.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';

export class S3CredentialsController extends OrganizationScopedController {
  list: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const credentials = await this.container.s3Credentials.list(routeParam(req, 'organizationId'));
    this.ok(res, { credentials });
  });

  create: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const credential = await this.container.s3Credentials.create(
      routeParam(req, 'organizationId'),
      auth.user.id,
      readBody(req, createS3CredentialBodySchema),
      requestMeta(req),
    );
    this.created(res, { credential });
  });

  revoke: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const credential = await this.container.s3Credentials.revoke(
      routeParam(req, 'organizationId'),
      routeParam(req, 'credentialId'),
      auth.user.id,
      requestMeta(req),
    );
    this.ok(res, { credential });
  });

  rotate: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const credential = await this.container.s3Credentials.rotate(
      routeParam(req, 'organizationId'),
      routeParam(req, 'credentialId'),
      auth.user.id,
      requestMeta(req),
    );
    this.created(res, { credential });
  });

  static readonly managePermission = PERMISSIONS.USERS_MANAGE;
}
