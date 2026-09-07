import { Router } from 'express';
import {
  loginBodySchema,
  registerBodySchema,
  selectOrganizationBodySchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { AuthController } from './controllers/auth.controller.js';
import { validateBody } from '../../middleware/validate.js';

export function createAuthRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new AuthController(container);

  router.post('/register', validateBody(registerBodySchema), controller.register);
  router.post('/login', validateBody(loginBodySchema), controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', controller.me);
  router.post(
    '/organization',
    validateBody(selectOrganizationBodySchema),
    controller.selectOrganization,
  );

  return router;
}
