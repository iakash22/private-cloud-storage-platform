import type { RequestHandler } from 'express';
import type { PermissionKey } from '@vaultstack/types';
import { createRequirePermission } from '../middleware/authorize.js';
import { AuthenticatedController } from './base.controller.js';

/** Base for routes scoped under `/organizations/:organizationId`. */
export abstract class OrganizationScopedController extends AuthenticatedController {
  protected allow(permission: PermissionKey | string): RequestHandler {
    return createRequirePermission(this.container.authorization, permission);
  }
}
