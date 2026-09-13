import { Router } from 'express';
import {
  disableTotpBodySchema,
  enableTotpBodySchema,
  loginBodySchema,
  registerBodySchema,
  selectOrganizationBodySchema,
  sessionIdParamsSchema,
  verifyTotpLoginBodySchema,
} from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { AuthController } from './controllers/auth.controller.js';
import { validateBody, validateParams } from '../../middleware/validate.js';

export function createAuthRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new AuthController(container);

  router.post('/register', validateBody(registerBodySchema), controller.register);
  router.post('/login', validateBody(loginBodySchema), controller.login);
  router.post('/login/totp', validateBody(verifyTotpLoginBodySchema), controller.verifyTotpLogin);
  router.post('/logout', controller.logout);
  router.get('/me', controller.me);
  router.get('/sessions', controller.listSessions);
  router.delete(
    '/sessions/:sessionId',
    validateParams(sessionIdParamsSchema),
    controller.revokeSession,
  );
  router.post('/sessions/revoke-others', controller.revokeOtherSessions);
  router.post(
    '/organization',
    validateBody(selectOrganizationBodySchema),
    controller.selectOrganization,
  );
  router.post('/2fa/setup', controller.setupTotp);
  router.post('/2fa/enable', validateBody(enableTotpBodySchema), controller.enableTotp);
  router.post('/2fa/disable', validateBody(disableTotpBodySchema), controller.disableTotp);

  return router;
}
