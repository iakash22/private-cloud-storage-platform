import { Router } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { Logger } from '@vaultstack/logger';
import type { PrismaClient } from '@vaultstack/database';
import {
  createAuthenticateMiddleware,
  createOptionalAuthenticateMiddleware,
} from '../middleware/authenticate.js';
import {
  createApiRateLimitMiddleware,
  createLoginRateLimitMiddleware,
  createSharePasswordRateLimitMiddleware,
} from '../middleware/rate-limit.js';
import { createAppContainer } from '../container/app-container.js';
import { createAuthRouter } from '../modules/auth/auth.router.js';
import { createOrganizationsRouter } from '../modules/organizations/organizations.router.js';
import { createPermissionsRouter } from '../modules/permissions/permissions.router.js';
import { createS3GatewayRouter } from '../modules/s3-gateway/s3-gateway.router.js';
import { createStorageContentRouter } from '../modules/storage/storage-content.router.js';
import { createSharePublicRouter } from '../modules/storage/share-public.router.js';
import { createStorageRouter } from '../modules/storage/storage.router.js';
import { createArtifactsRouter } from '../modules/artifacts/artifacts.router.js';
import { createBackupsRouter } from '../modules/backups/backups.router.js';
import { createInfrastructureRouter } from '../modules/infrastructure/infrastructure.router.js';
import { createRealtimeRouter } from '../modules/realtime/realtime.router.js';
import type { RateLimiter } from '../lib/rate-limit.js';
import type { AppContainer } from '../container/app-container.js';

export function createV1Router(
  prisma: PrismaClient,
  config: EnvConfig,
  limiter: RateLimiter,
  logger: Logger,
  existingContainer?: AppContainer,
): Router {
  const router = Router();
  const container = existingContainer ?? createAppContainer(prisma, config, logger);
  const authenticate = createAuthenticateMiddleware(container.authentication);
  const optionalAuthenticate = createOptionalAuthenticateMiddleware(container.authentication);
  const loginRateLimit = createLoginRateLimitMiddleware(limiter, config);
  const sharePasswordRateLimit = createSharePasswordRateLimitMiddleware(limiter, config);

  router.use((req, res, next) => {
    if (req.path.startsWith('/realtime/')) {
      next();
      return;
    }
    void createApiRateLimitMiddleware(limiter, config)(req, res, next);
  });

  router.use('/auth', (req, res, next) => {
    const isPublicAuthPost =
      req.method === 'POST' &&
      (req.path === '/login' || req.path === '/login/totp' || req.path === '/register');

    if (isPublicAuthPost && (req.path === '/login' || req.path === '/login/totp')) {
      void loginRateLimit(req, res, next);
      return;
    }
    if (req.path === '/register' || req.path === '/login' || req.path === '/login/totp') {
      next();
      return;
    }
    void authenticate(req, res, next);
  });
  router.use('/auth', createAuthRouter(container));

  router.use('/organizations', authenticate, createOrganizationsRouter(container));
  router.use('/permissions', authenticate, createPermissionsRouter(container));

  router.use(
    '/public',
    optionalAuthenticate,
    createSharePublicRouter(container, sharePasswordRateLimit),
  );

  router.use('/storage', createStorageContentRouter(container));

  router.use('/storage', authenticate, createStorageRouter(container));
  router.use('/artifacts', authenticate, createArtifactsRouter(container));
  router.use('/backups', authenticate, createBackupsRouter(container));
  router.use('/infrastructure', authenticate, createInfrastructureRouter(container));
  router.use('/realtime', authenticate, createRealtimeRouter(container));

  if (config.S3_GATEWAY_ENABLED) {
    router.use('/s3', createS3GatewayRouter(container, limiter));
  }

  return router;
}
