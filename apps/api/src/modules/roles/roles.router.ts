import { Router } from 'express';
import {
  createRoleBodySchema,
  organizationIdParamsSchema,
  organizationRoleParamsSchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { RolesController } from './controllers/roles.controller.js';

export function createRolesRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new RolesController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    controller.allow(RolesController.readPermission),
    controller.list,
  );

  router.post(
    '/',
    validateParams(organizationIdParamsSchema),
    validateBody(createRoleBodySchema),
    controller.allow(RolesController.managePermission),
    controller.create,
  );

  router.get(
    '/:roleId',
    validateParams(organizationRoleParamsSchema),
    controller.allow(RolesController.readPermission),
    controller.get,
  );

  return router;
}
