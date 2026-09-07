import { Router } from 'express';
import { createUnconfiguredS3AuthStrategy, type S3AuthStrategy } from './s3-auth.strategy.js';
import { S3GatewayController } from './controllers/s3-gateway.controller.js';

/**
 * S3-compatible gateway (protocol foundation — operation handlers not yet wired).
 */
export function createS3GatewayRouter(options?: { auth?: S3AuthStrategy }): Router {
  const router = Router();
  const auth = options?.auth ?? createUnconfiguredS3AuthStrategy();
  const controller = new S3GatewayController(auth);

  router.all(/.*/, controller.handle);

  return router;
}
