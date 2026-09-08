import type { NextFunction, Request, Response } from 'express';
import { AppError, unauthorized } from '../lib/errors.js';
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

/** Authenticates when credentials are present; continues anonymously on 401. */
export function createOptionalAuthenticateMiddleware(authentication: AuthenticationService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.auth = await authentication.authenticate(req);
      next();
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 401) {
        next();
        return;
      }
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
