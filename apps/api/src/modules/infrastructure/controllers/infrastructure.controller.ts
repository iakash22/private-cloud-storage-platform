import type { Request, RequestHandler, Response } from 'express';
import { PERMISSIONS, type PermissionKey } from '@vaultstack/types';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { createRequireOrganizationPermission } from '../../../middleware/authorize.js';
import { currentOrganizationId } from '../../../middleware/organization-context.js';
import { AuthenticatedController } from '../../../http/base.controller.js';

export class InfrastructureController extends AuthenticatedController {
  static readonly readPermission = PERMISSIONS.INFRASTRUCTURE_READ;

  protected organizationId(req: Request): string {
    return currentOrganizationId(req);
  }

  allow(permission: PermissionKey): RequestHandler {
    return createRequireOrganizationPermission(this.container.authorization, permission);
  }

  summary: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const summary = await this.container.infrastructure.summary(this.organizationId(req));
    this.ok(res, { summary });
  });

  server: AsyncRouteHandler = asyncHandler(async (_req: Request, res: Response) => {
    const server = await this.container.infrastructure.server();
    this.ok(res, { server });
  });

  disks: AsyncRouteHandler = asyncHandler(async (_req: Request, res: Response) => {
    const disks = await this.container.infrastructure.disks();
    this.ok(res, { disks });
  });

  storage: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response) => {
    const storage = await this.container.infrastructure.storage(this.organizationId(req));
    this.ok(res, { storage });
  });

  docker: AsyncRouteHandler = asyncHandler(async (_req: Request, res: Response) => {
    const docker = await this.container.infrastructure.docker();
    this.ok(res, { docker });
  });
}
