import { Router } from 'express';
import type { AppContainer } from '../../container/app-container.js';
import { requireOrganizationContext } from '../../middleware/organization-context.js';
import { InfrastructureController } from './controllers/infrastructure.controller.js';

/**
 * Host and storage monitoring. Collectors are fixed (os, statfs, Docker socket,
 * Prisma + StorageService). There is no command-execution surface.
 */
export function createInfrastructureRouter(container: AppContainer): Router {
  const router = Router();
  const controller = new InfrastructureController(container);

  router.use(requireOrganizationContext);

  router.get('/summary', controller.allow(InfrastructureController.readPermission), controller.summary);
  router.get('/server', controller.allow(InfrastructureController.readPermission), controller.server);
  router.get('/disks', controller.allow(InfrastructureController.readPermission), controller.disks);
  router.get('/storage', controller.allow(InfrastructureController.readPermission), controller.storage);
  router.get('/docker', controller.allow(InfrastructureController.readPermission), controller.docker);

  return router;
}
