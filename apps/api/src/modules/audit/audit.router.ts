import { Router } from 'express';
import { auditLogQuerySchema, organizationIdParamsSchema } from '@vaultstack/validation';
import type { AppContainer } from '../../container/app-container.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import { AuditController } from './controllers/audit.controller.js';

export function createAuditRouter(container: AppContainer): Router {
  const router = Router({ mergeParams: true });
  const controller = new AuditController(container);

  router.get(
    '/',
    validateParams(organizationIdParamsSchema),
    validateQuery(auditLogQuerySchema),
    controller.allow(AuditController.readPermission),
    controller.list,
  );

  return router;
}
