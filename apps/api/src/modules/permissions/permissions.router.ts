import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { PermissionsController } from './controllers/permissions.controller.js';

export function createPermissionsRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new PermissionsController(container);

  router.get('/', controller.list);

  return router;
}
