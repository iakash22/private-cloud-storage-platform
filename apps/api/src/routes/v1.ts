import { Router } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import {
  createApiRateLimitMiddleware,
  createLoginRateLimitMiddleware,
} from '../middleware/rate-limit.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createOrganizationsRouter } from '../modules/organizations/organizations.router.js';
import { createPermissionsRouter } from '../modules/permissions/permissions.router.js';
import { createServices } from '../modules/services.js';
import { createS3GatewayRouter } from '../modules/s3-gateway/s3-gateway.routes.js';
import { createStorageContentRouter } from '../modules/storage/routes/storage-content.routes.js';
import { createStorageRouter } from '../modules/storage/routes/storage.routes.js';
import type { RateLimiter } from '../lib/rate-limit.js';

export function createV1Router(
  prisma: PrismaClient,
  config: EnvConfig,
  limiter: RateLimiter,
  logger: Logger,
): Router {
  const router = Router();
  const services = createServices(prisma, config, logger);
  const authenticate = createAuthenticateMiddleware(prisma, config, services.sessions);
  const loginRateLimit = createLoginRateLimitMiddleware(limiter, config);

  router.use(createApiRateLimitMiddleware(limiter, config));

  router.use('/auth', (req, res, next) => {
    if (req.path === '/login' && req.method === 'POST') {
      void loginRateLimit(req, res, next);
      return;
    }
    if (req.path === '/register' || req.path === '/login') {
      next();
      return;
    }
    void authenticate(req, res, next);
  });
  router.use('/auth', createAuthRouter(services, config));

  router.use('/organizations', authenticate, createOrganizationsRouter(services));
  router.use('/permissions', authenticate, createPermissionsRouter(services));

  // Byte transfer authorized by scoped storage tokens rather than a session,
  // so it is mounted ahead of (and outside) the authenticated storage router.
  router.use(
    '/storage',
    createStorageContentRouter({
      objects: services.storage.objects,
      uploads: services.storage.uploads,
      tokens: services.storage.tokens,
      metrics: services.storage.metrics,
    }),
  );

  router.use('/storage', authenticate, createStorageRouter(services.storage));

  if (config.S3_GATEWAY_ENABLED) {
    router.use('/s3', createS3GatewayRouter());
  }

  return router;
}
