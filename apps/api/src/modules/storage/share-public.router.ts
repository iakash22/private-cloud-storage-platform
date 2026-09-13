import {
  inspectShareQuerySchema,
  shareDownloadBodySchema,
  shareTokenParamsSchema,
  unlockShareBodySchema,
} from '@vaultstack/validation';
import { Router, type RequestHandler } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { SharePublicController } from './controllers/share-public.controller.js';

/**
 * Anonymous and optionally-authenticated share consumption.
 * Mounted outside the session-authenticated storage router.
 */
export function createSharePublicRouter(
  container: AppContainer,
  passwordRateLimit: RequestHandler,
): Router {
  const router = Router();
  const controller = new SharePublicController(container);

  router.get(
    '/shares/:token',
    validateParams(shareTokenParamsSchema),
    validateQuery(inspectShareQuerySchema),
    controller.inspect,
  );

  router.post(
    '/shares/:token/unlock',
    validateParams(shareTokenParamsSchema),
    passwordRateLimit,
    validateBody(unlockShareBodySchema),
    controller.unlock,
  );

  router.post(
    '/shares/:token/download-url',
    validateParams(shareTokenParamsSchema),
    passwordRateLimit,
    validateBody(shareDownloadBodySchema),
    controller.createDownloadUrl,
  );

  router.post(
    '/shares/:token/preview-url',
    validateParams(shareTokenParamsSchema),
    passwordRateLimit,
    validateBody(shareDownloadBodySchema),
    controller.createPreviewUrl,
  );

  return router;
}
