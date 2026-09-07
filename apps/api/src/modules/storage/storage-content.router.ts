import { objectIdParamsSchema, uploadContentQuerySchema, uploadIdParamsSchema } from '@vaultstack/validation';
import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import { StorageContentController } from './controllers/storage-content.controller.js';

/**
 * Byte-transfer routes authorized by a scoped, short-lived HMAC token instead
 * of a browser session. Mounted outside the authenticated router on purpose.
 */
export function createStorageContentRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new StorageContentController(container);

  router.get(
    '/objects/:objectId/content',
    validateParams(objectIdParamsSchema),
    validateQuery(uploadContentQuerySchema),
    controller.downloadContent,
  );

  router.put(
    '/uploads/:uploadId/content',
    validateParams(uploadIdParamsSchema),
    validateQuery(uploadContentQuerySchema),
    controller.uploadContent,
  );

  return router;
}
