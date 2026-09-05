import { Router } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createOrganizationsRouter } from '../modules/organizations/organizations.router.js';
import { createPermissionsRouter } from '../modules/permissions/permissions.router.js';
import { createServices } from '../modules/services.js';

export function createV1Router(prisma: PrismaClient, config: EnvConfig): Router {
  const router = Router();
  const services = createServices(prisma, config);
  const authenticate = createAuthenticateMiddleware(prisma, config);

  router.use('/auth', (req, res, next) => {
    if (req.path === '/register' || req.path === '/login') {
      next();
      return;
    }
    void authenticate(req, res, next);
  });
  router.use('/auth', createAuthRouter(services));

  router.use('/organizations', authenticate, createOrganizationsRouter(services));
  router.use('/permissions', authenticate, createPermissionsRouter(services));

  return router;
}
