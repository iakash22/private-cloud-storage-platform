import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors.js';
import { routeParam } from '../lib/route-param.js';
import type { AuthorizationService } from '../modules/auth/authorization.service.js';
import { requireAuth } from './authenticate.js';
import { currentOrganizationId } from './organization-context.js';

export function createRequirePermission(authorization: AuthorizationService, permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = requireAuth(req);
      const organizationId = routeParam(req, 'organizationId');

      const allowed = await authorization.can(auth.user, permission, {
        type: 'organization',
        id: organizationId,
        organizationId,
      });

      if (!allowed) {
        throw forbidden();
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Same permission check as `createRequirePermission`, but for routes that carry
 * the organization in the authenticated context rather than the path.
 *
 * Must run after `requireOrganizationContext`, which is what guarantees the
 * organization has already been validated against the caller's memberships.
 */
export function createRequireOrganizationPermission(
  authorization: AuthorizationService,
  permission: string,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = requireAuth(req);
      const organizationId = currentOrganizationId(req);

      const allowed = await authorization.can(auth.user, permission, {
        type: 'organization',
        id: organizationId,
        organizationId,
      });

      if (!allowed) {
        throw forbidden();
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
