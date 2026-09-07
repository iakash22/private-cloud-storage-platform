import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import type { AuthContext } from '../modules/auth/auth.types.js';
import type { AuthenticationService } from '../modules/auth/services/authentication.service.js';

export function createAuthenticateMiddleware(authentication: AuthenticationService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.auth = await authentication.authenticate(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw unauthorized('Authentication is required');
  }
  return req.auth;
}
