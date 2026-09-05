import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors.js';
import { routeParam } from '../lib/route-param.js';
import type { AuthorizationService } from '../modules/auth/authorization.service.js';
import { requireAuth } from './authenticate.js';

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
