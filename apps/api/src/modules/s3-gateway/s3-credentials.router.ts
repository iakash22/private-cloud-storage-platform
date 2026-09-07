import { Router } from 'express';
import {
  createS3CredentialBodySchema,
  organizationIdParamsSchema,
  s3CredentialIdParamsSchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { S3CredentialsController } from './controllers/s3-credentials.controller.js';

export function createS3CredentialsRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new S3CredentialsController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    controller.allow(S3CredentialsController.managePermission),
    controller.list,
  );

  router.post(
    '/',
    validateParams(organizationIdParamsSchema),
    validateBody(createS3CredentialBodySchema),
    controller.allow(S3CredentialsController.managePermission),
    controller.create,
  );

  router.post(
    '/:credentialId/revoke',
    validateParams(s3CredentialIdParamsSchema),
    controller.allow(S3CredentialsController.managePermission),
    controller.revoke,
  );

  router.post(
    '/:credentialId/rotate',
    validateParams(s3CredentialIdParamsSchema),
    controller.allow(S3CredentialsController.managePermission),
    controller.rotate,
  );

  return router;
}
