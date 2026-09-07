import { Router } from 'express';
import {
  createTeamBodySchema,
  organizationIdParamsSchema,
  organizationTeamParamsSchema,
  updateTeamBodySchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { TeamsController } from './controllers/teams.controller.js';

export function createTeamsRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new TeamsController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    controller.allow(TeamsController.readPermission),
    controller.list,
  );

  router.post(
    '/',
    validateParams(organizationIdParamsSchema),
    validateBody(createTeamBodySchema),
    controller.allow(TeamsController.managePermission),
    controller.create,
  );

  router.get(
    '/:teamId',
    validateParams(organizationTeamParamsSchema),
    controller.allow(TeamsController.readPermission),
    controller.get,
  );

  router.patch(
    '/:teamId',
    validateParams(organizationTeamParamsSchema),
    validateBody(updateTeamBodySchema),
    controller.allow(TeamsController.managePermission),
    controller.update,
  );

  router.delete(
    '/:teamId',
    validateParams(organizationTeamParamsSchema),
    controller.allow(TeamsController.managePermission),
    controller.remove,
  );

  return router;
}
