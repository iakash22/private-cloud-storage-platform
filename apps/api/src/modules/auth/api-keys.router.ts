import { Router } from 'express';
import { apiKeyIdParamsSchema, createApiKeyBodySchema, organizationIdParamsSchema } from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { ApiKeysController } from './controllers/api-keys.controller.js';

export function createApiKeysRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new ApiKeysController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    controller.allow(ApiKeysController.managePermission),
    controller.list,
  );

  router.post(
    '/',
    validateParams(organizationIdParamsSchema),
    validateBody(createApiKeyBodySchema),
    controller.allow(ApiKeysController.managePermission),
    controller.create,
  );

  router.delete(
    '/:apiKeyId',
    validateParams(apiKeyIdParamsSchema),
    controller.allow(ApiKeysController.managePermission),
    controller.revoke,
  );

  return router;
}
