import type { Request, RequestHandler } from 'express';
import type { PermissionKey } from '@vaultstack/types';
import { currentOrganizationId } from '../middleware/organization-context.js';
import { createRequireOrganizationPermission } from '../middleware/authorize.js';
import type { AppContainer } from '../container/app-container.js';
import { AuthenticatedController } from './base.controller.js';

/** Base for storage routes that resolve organization from auth context, not the path. */
export abstract class StorageScopedController extends AuthenticatedController {
  constructor(protected readonly container: AppContainer) {
    super(container);
  }

  protected organizationId(req: Request): string {
    return currentOrganizationId(req);
  }

  protected allow(permission: PermissionKey | string): RequestHandler {
    return createRequireOrganizationPermission(this.container.storage.authorization, permission);
  }
}
