import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import type { RateLimiter } from '../../lib/rate-limit.js';
import { createS3RateLimitMiddleware } from '../../middleware/rate-limit.js';
import { createSigV4S3AuthStrategy } from './sigv4-auth.strategy.js';
import { S3GatewayController } from './controllers/s3-gateway.controller.js';

export function createS3GatewayRouter(container: AppContainer, limiter: RateLimiter): Router {
  const router = Router();
  const auth = createSigV4S3AuthStrategy(container.s3Credentials, container.config);
  const controller = new S3GatewayController(auth, container.storage);

  router.use(createS3RateLimitMiddleware(limiter, container.config));
  router.all(/.*/, controller.handle);

  return router;
}
