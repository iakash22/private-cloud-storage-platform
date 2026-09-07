import { Router } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { Logger } from '@vaultstack/logger';
import type { PrismaClient } from '@vaultstack/database';
import { createAuthenticateMiddleware } from '../middleware/authenticate.js';
import {
  createApiRateLimitMiddleware,
  createLoginRateLimitMiddleware,
} from '../middleware/rate-limit.js';
import { createAppContainer } from '../container/app-container.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createOrganizationsRouter } from '../modules/organizations/organizations.router.js';
import { createPermissionsRouter } from '../modules/permissions/permissions.router.js';
import { createS3GatewayRouter } from '../modules/s3-gateway/s3-gateway.router.js';
import { createStorageContentRouter } from '../modules/storage/storage-content.router.js';
import { createStorageRouter } from '../modules/storage/storage.router.js';
import type { RateLimiter } from '../lib/rate-limit.js';

export function createV1Router(
  prisma: PrismaClient,
  config: EnvConfig,
  limiter: RateLimiter,
  logger: Logger,
): Router {
  const router = Router();
  const container = createAppContainer(prisma, config, logger);
  const authenticate = createAuthenticateMiddleware(container.authentication);
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
  router.use('/auth', createAuthRouter(container));

  router.use('/organizations', authenticate, createOrganizationsRouter(container));
  router.use('/permissions', authenticate, createPermissionsRouter(container));

  router.use('/storage', createStorageContentRouter(container));

  router.use('/storage', authenticate, createStorageRouter(container));

  if (config.S3_GATEWAY_ENABLED) {
    router.use('/s3', createS3GatewayRouter());
  }

  return router;
}
