import { Router } from 'express';
import {
  createOrganizationBodySchema,
  organizationIdParamsSchema,
  updateOrganizationBodySchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { createApiKeysRouter } from '../auth/api-keys.router.js';
import { createS3CredentialsRouter } from '../s3-gateway/s3-credentials.router.js';
import { createAuditRouter } from '../audit/audit.router.js';
import { createRolesRouter } from '../roles/roles.router.js';
import { createTeamsRouter } from '../teams/teams.router.js';
import { createUsersRouter } from '../users/users.router.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { OrganizationsController } from './controllers/organizations.controller.js';

export function createOrganizationsRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new OrganizationsController(container);

  router.get('/', controller.list);

  router.post('/', validateBody(createOrganizationBodySchema), controller.create);

  router.get(
    '/:organizationId',
    validateParams(organizationIdParamsSchema),
    controller.allow(OrganizationsController.readPermission),
    controller.get,
  );

  router.patch(
    '/:organizationId',
    validateParams(organizationIdParamsSchema),
    validateBody(updateOrganizationBodySchema),
    controller.allow(OrganizationsController.managePermission),
    controller.update,
  );

  router.use('/:organizationId/users', createUsersRouter(container));
  router.use('/:organizationId/teams', createTeamsRouter(container));
  router.use('/:organizationId/roles', createRolesRouter(container));
  router.use('/:organizationId/api-keys', createApiKeysRouter(container));
  router.use('/:organizationId/s3-credentials', createS3CredentialsRouter(container));
  router.use('/:organizationId/audit-logs', createAuditRouter(container));

  return router;
}
