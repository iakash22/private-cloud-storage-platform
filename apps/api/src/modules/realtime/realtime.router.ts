import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { RealtimeController } from './controllers/realtime.controller.js';

export function createRealtimeRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new RealtimeController(container);

  router.get('/events', requireOrganizationContext, controller.streamEvents);

  return router;
}
