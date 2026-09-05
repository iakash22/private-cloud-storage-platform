import { PERMISSIONS } from '@vaultstack/types';
import {
  createApiKeyBodySchema,
  createOrganizationBodySchema,
  createRoleBodySchema,
  createTeamBodySchema,
  createUserBodySchema,
  organizationIdParamsSchema,
  organizationRoleParamsSchema,
  organizationTeamParamsSchema,
  organizationUserParamsSchema,
  updateOrganizationBodySchema,
  updateTeamBodySchema,
  updateUserBodySchema,
  userRoleParamsSchema,
  assignRoleBodySchema,
  apiKeyIdParamsSchema,
  auditLogQuerySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import { requestMeta } from '../../lib/audit.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { routeParam } from '../../lib/route-param.js';
import { createRequirePermission } from '../../middleware/authorize.js';
import { requireAuth } from '../../middleware/authenticate.js';
import {
  readBody,
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import type { AppServices } from '../services.js';

export function createOrganizationsRouter(services: AppServices): Router {
  const router = Router();
  const allow = (permission: string) => createRequirePermission(services.authorization, permission);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const organizations = await services.organizations.listForUser(auth.user.id);
      res.status(200).json({ organizations });
    }),
  );

  router.post(
    '/',
    validateBody(createOrganizationBodySchema),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const organization = await services.organizations.create(
        auth.user.id,
        readBody(req, createOrganizationBodySchema).name,
        requestMeta(req),
      );
      res.status(201).json({ organization });
    }),
  );

  router.get(
    '/:organizationId',
    validateParams(organizationIdParamsSchema),
    allow(PERMISSIONS.ORGANIZATIONS_READ),
    asyncHandler(async (req, res) => {
      const organization = await services.organizations.getById(routeParam(req, 'organizationId'));
      res.status(200).json({ organization });
    }),
  );

  router.patch(
    '/:organizationId',
    validateParams(organizationIdParamsSchema),
    validateBody(updateOrganizationBodySchema),
    allow(PERMISSIONS.ORGANIZATIONS_UPDATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const organization = await services.organizations.update(
        routeParam(req, 'organizationId'),
        readBody(req, updateOrganizationBodySchema).name,
        auth.user.id,
        requestMeta(req),
      );
      res.status(200).json({ organization });
    }),
  );

  router.get(
    '/:organizationId/users',
    validateParams(organizationIdParamsSchema),
    allow(PERMISSIONS.USERS_READ),
    asyncHandler(async (req, res) => {
      const users = await services.users.list(routeParam(req, 'organizationId'));
      res.status(200).json({ users });
    }),
  );

  router.post(
    '/:organizationId/users',
    validateParams(organizationIdParamsSchema),
    validateBody(createUserBodySchema),
    allow(PERMISSIONS.USERS_CREATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const user = await services.users.create(
        routeParam(req, 'organizationId'),
        readBody(req, createUserBodySchema),
        auth.user.id,
        requestMeta(req),
      );
      res.status(201).json({ user });
    }),
  );

  router.get(
    '/:organizationId/users/:userId',
    validateParams(organizationUserParamsSchema),
    allow(PERMISSIONS.USERS_READ),
    asyncHandler(async (req, res) => {
      const user = await services.users.getInOrganization(
        routeParam(req, 'organizationId'),
        routeParam(req, 'userId'),
      );
      res.status(200).json({ user });
    }),
  );

  router.patch(
    '/:organizationId/users/:userId',
    validateParams(organizationUserParamsSchema),
    validateBody(updateUserBodySchema),
    allow(PERMISSIONS.USERS_UPDATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const user = await services.users.update(
        routeParam(req, 'organizationId'),
        routeParam(req, 'userId'),
        readBody(req, updateUserBodySchema),
        auth.user.id,
        requestMeta(req),
      );
      res.status(200).json({ user });
    }),
  );

  router.post(
    '/:organizationId/users/:userId/roles',
    validateParams(organizationUserParamsSchema),
    validateBody(assignRoleBodySchema),
    allow(PERMISSIONS.ROLES_ASSIGN),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.roles.assign(
        routeParam(req, 'organizationId'),
        routeParam(req, 'userId'),
        readBody(req, assignRoleBodySchema).roleId,
        auth.user.id,
        requestMeta(req),
      );
      res.status(204).send();
    }),
  );

  router.delete(
    '/:organizationId/users/:userId/roles/:roleId',
    validateParams(userRoleParamsSchema),
    allow(PERMISSIONS.ROLES_ASSIGN),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.roles.unassign(
        routeParam(req, 'organizationId'),
        routeParam(req, 'userId'),
        routeParam(req, 'roleId'),
        auth.user.id,
        requestMeta(req),
      );
      res.status(204).send();
    }),
  );

  router.get(
    '/:organizationId/teams',
    validateParams(organizationIdParamsSchema),
    allow(PERMISSIONS.TEAMS_READ),
    asyncHandler(async (req, res) => {
      const teams = await services.teams.list(routeParam(req, 'organizationId'));
      res.status(200).json({ teams });
    }),
  );

  router.post(
    '/:organizationId/teams',
    validateParams(organizationIdParamsSchema),
    validateBody(createTeamBodySchema),
    allow(PERMISSIONS.TEAMS_CREATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const team = await services.teams.create(
        routeParam(req, 'organizationId'),
        readBody(req, createTeamBodySchema).name,
        auth.user.id,
        requestMeta(req),
      );
      res.status(201).json({ team });
    }),
  );

  router.get(
    '/:organizationId/teams/:teamId',
    validateParams(organizationTeamParamsSchema),
    allow(PERMISSIONS.TEAMS_READ),
    asyncHandler(async (req, res) => {
      const team = await services.teams.get(
        routeParam(req, 'organizationId'),
        routeParam(req, 'teamId'),
      );
      res.status(200).json({ team });
    }),
  );

  router.patch(
    '/:organizationId/teams/:teamId',
    validateParams(organizationTeamParamsSchema),
    validateBody(updateTeamBodySchema),
    allow(PERMISSIONS.TEAMS_UPDATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const team = await services.teams.update(
        routeParam(req, 'organizationId'),
        routeParam(req, 'teamId'),
        readBody(req, updateTeamBodySchema).name,
        auth.user.id,
        requestMeta(req),
      );
      res.status(200).json({ team });
    }),
  );

  router.delete(
    '/:organizationId/teams/:teamId',
    validateParams(organizationTeamParamsSchema),
    allow(PERMISSIONS.TEAMS_DELETE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.teams.remove(
        routeParam(req, 'organizationId'),
        routeParam(req, 'teamId'),
        auth.user.id,
        requestMeta(req),
      );
      res.status(204).send();
    }),
  );

  router.get(
    '/:organizationId/roles',
    validateParams(organizationIdParamsSchema),
    allow(PERMISSIONS.ROLES_READ),
    asyncHandler(async (req, res) => {
      const roles = await services.roles.list(routeParam(req, 'organizationId'));
      res.status(200).json({ roles });
    }),
  );

  router.post(
    '/:organizationId/roles',
    validateParams(organizationIdParamsSchema),
    validateBody(createRoleBodySchema),
    allow(PERMISSIONS.ROLES_CREATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const role = await services.roles.create(
        routeParam(req, 'organizationId'),
        readBody(req, createRoleBodySchema),
        auth.user.id,
        requestMeta(req),
      );
      res.status(201).json({ role });
    }),
  );

  router.get(
    '/:organizationId/roles/:roleId',
    validateParams(organizationRoleParamsSchema),
    allow(PERMISSIONS.ROLES_READ),
    asyncHandler(async (req, res) => {
      const role = await services.roles.get(
        routeParam(req, 'organizationId'),
        routeParam(req, 'roleId'),
      );
      res.status(200).json({ role });
    }),
  );

  router.get(
    '/:organizationId/api-keys',
    validateParams(organizationIdParamsSchema),
    allow(PERMISSIONS.API_KEYS_READ),
    asyncHandler(async (req, res) => {
      const apiKeys = await services.apiKeys.list(routeParam(req, 'organizationId'));
      res.status(200).json({ apiKeys });
    }),
  );

  router.post(
    '/:organizationId/api-keys',
    validateParams(organizationIdParamsSchema),
    validateBody(createApiKeyBodySchema),
    allow(PERMISSIONS.API_KEYS_CREATE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const apiKey = await services.apiKeys.create(
        routeParam(req, 'organizationId'),
        auth.user.id,
        readBody(req, createApiKeyBodySchema),
        requestMeta(req),
      );
      res.status(201).json({ apiKey });
    }),
  );

  router.delete(
    '/:organizationId/api-keys/:apiKeyId',
    validateParams(apiKeyIdParamsSchema),
    allow(PERMISSIONS.API_KEYS_REVOKE),
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const apiKey = await services.apiKeys.revoke(
        routeParam(req, 'organizationId'),
        routeParam(req, 'apiKeyId'),
        auth.user.id,
        requestMeta(req),
      );
      res.status(200).json({ apiKey });
    }),
  );

  router.get(
    '/:organizationId/audit-logs',
    validateParams(organizationIdParamsSchema),
    validateQuery(auditLogQuerySchema),
    allow(PERMISSIONS.AUDIT_READ),
    asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit ?? 50);
      const auditLogs = await services.audit.list(routeParam(req, 'organizationId'), limit);
      res.status(200).json({ auditLogs });
    }),
  );

  return router;
}
