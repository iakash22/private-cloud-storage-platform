import { loginBodySchema, registerBodySchema } from '@vaultstack/validation';
import { Router } from 'express';
import { requestMeta } from '../../lib/audit.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { readBody, validateBody } from '../../middleware/validate.js';
import type { AppServices } from '../services.js';

export function createAuthRouter(services: AppServices): Router {
  const router = Router();

  router.post(
    '/register',
    validateBody(registerBodySchema),
    asyncHandler(async (req, res) => {
      const result = await services.auth.register(
        readBody(req, registerBodySchema),
        requestMeta(req),
      );
      res.status(201).json(result);
    }),
  );

  router.post(
    '/login',
    validateBody(loginBodySchema),
    asyncHandler(async (req, res) => {
      const result = await services.auth.login(readBody(req, loginBodySchema));
      res.status(200).json(result);
    }),
  );

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const result = await services.auth.me(auth.user.id);
      res.status(200).json(result);
    }),
  );

  return router;
}
