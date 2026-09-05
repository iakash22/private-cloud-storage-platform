import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middleware/authenticate.js';
import type { AppServices } from '../services.js';

export function createPermissionsRouter(services: AppServices): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      requireAuth(req);
      const permissions = await services.permissions.list();
      res.status(200).json({ permissions });
    }),
  );

  return router;
}
