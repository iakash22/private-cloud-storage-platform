import type { Request, RequestHandler } from 'express';
import type { PermissionKey } from '@vaultstack/types';
import { currentOrganizationId } from '../middleware/organization-context.js';
import { createRequireOrganizationPermission } from '../middleware/authorize.js';
import { AuthenticatedController } from './base.controller.js';

/** Base for storage routes that resolve organization from auth context, not the path. */
export abstract class StorageScopedController extends AuthenticatedController {
  protected organizationId(req: Request): string {
    return currentOrganizationId(req);
  }

  allow(permission: PermissionKey): RequestHandler {
    return createRequireOrganizationPermission(this.container.storage.authorization, permission);
  }
}
