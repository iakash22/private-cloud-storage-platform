import { auditLogQuerySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@vaultstack/types';
import { asyncHandler } from '../../../lib/async-handler.js';
import { routeParam } from '../../../lib/route-param.js';
import { OrganizationScopedController } from '../../../http/organization-scoped.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class AuditController extends OrganizationScopedController {
  constructor(container: AppContainer) {
    super(container);
  }

  list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { limit = 50 } = auditLogQuerySchema.parse(req.query);
    const auditLogs = await this.container.audit.list(routeParam(req, 'organizationId'), limit);
    this.ok(res, { auditLogs });
  });

  static readonly readPermission = PERMISSIONS.AUDIT_READ;
}
