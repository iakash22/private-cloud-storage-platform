import { Router } from 'express';
import {
  assignRoleBodySchema,
  createUserBodySchema,
  organizationIdParamsSchema,
  organizationUserParamsSchema,
  updateUserBodySchema,
  userRoleParamsSchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { UsersController } from './controllers/users.controller.js';

export function createUsersRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new UsersController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    controller.allow(UsersController.readPermission),
    controller.list,
  );

  router.post(
    '/',
    validateParams(organizationIdParamsSchema),
    validateBody(createUserBodySchema),
    controller.allow(UsersController.managePermission),
    controller.create,
  );

  router.get(
    '/:userId',
    validateParams(organizationUserParamsSchema),
    controller.allow(UsersController.readPermission),
    controller.get,
  );

  router.patch(
    '/:userId',
    validateParams(organizationUserParamsSchema),
    validateBody(updateUserBodySchema),
    controller.allow(UsersController.managePermission),
    controller.update,
  );

  router.post(
    '/:userId/roles',
    validateParams(organizationUserParamsSchema),
    validateBody(assignRoleBodySchema),
    controller.allow(UsersController.managePermission),
    controller.assignRole,
  );

  router.delete(
    '/:userId/roles/:roleId',
    validateParams(userRoleParamsSchema),
    controller.allow(UsersController.managePermission),
    controller.unassignRole,
  );

  return router;
}
