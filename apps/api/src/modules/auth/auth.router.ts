import { CSRF_COOKIE_NAME, ORGANIZATION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@vaultstack/types';
import {
  loginBodySchema,
  registerBodySchema,
  selectOrganizationBodySchema,
} from '@vaultstack/validation';
import { Router } from 'express';
import { requestMeta } from '../../lib/audit.js';
import { asyncHandler } from '../../lib/async-handler.js';
import {
  clearSessionCookies,
  readCookies,
  setOrganizationCookie,
  setSessionCookies,
} from '../../lib/cookies.js';
import type { EnvConfig } from '@vaultstack/config';
import { storageAccessDenied } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/authenticate.js';
import { readBody, validateBody } from '../../middleware/validate.js';
import type { AppServices } from '../services.js';

export function createAuthRouter(services: AppServices, config: EnvConfig): Router {
  const router = Router();

  router.post(
    '/register',
    validateBody(registerBodySchema),
    asyncHandler(async (req, res) => {
      const result = await services.auth.register(readBody(req, registerBodySchema), {
        ...requestMeta(req),
        previousSessionToken: readCookies(req)[SESSION_COOKIE_NAME],
      });
      setSessionCookies(res, config, result.session);
      res.status(201).json({
        user: result.user,
        organization: result.organization,
        organizations: result.organizations,
        memberships: result.memberships,
        csrfToken: result.csrfToken,
      });
    }),
  );

  router.post(
    '/login',
    validateBody(loginBodySchema),
    asyncHandler(async (req, res) => {
      const result = await services.auth.login(readBody(req, loginBodySchema), {
        ...requestMeta(req),
        previousSessionToken: readCookies(req)[SESSION_COOKIE_NAME],
      });
      setSessionCookies(res, config, result.session);
      res.status(200).json({
        user: result.user,
        organizations: result.organizations,
        memberships: result.memberships,
        csrfToken: result.csrfToken,
      });
    }),
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      await services.auth.logout(auth.user.id, auth.sessionId, requestMeta(req));
      clearSessionCookies(res, config);
      res.status(204).send();
    }),
  );

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      const auth = requireAuth(req);
      const result = await services.auth.me(auth.user.id);
      const csrfToken = readCookies(req)[CSRF_COOKIE_NAME];
      res.status(200).json({
        ...result,
        csrfToken,
        activeOrganizationId: readCookies(req)[ORGANIZATION_COOKIE_NAME] ?? null,
      });
    }),
  );

  /**
   * Selects the organization that flat routes such as /api/v1/storage act on.
   *
   * Membership is checked here against the authenticated context, and checked
   * again on every subsequent request, so the resulting cookie is a
   * convenience rather than a grant.
   */
  router.post(
    '/organization',
    validateBody(selectOrganizationBodySchema),
    // Synchronous on purpose: membership is already resolved on the request,
    // so no lookup is needed. Express propagates a thrown AppError itself.
    (req, res) => {
      const auth = requireAuth(req);
      const { organizationId } = readBody(req, selectOrganizationBodySchema);

      if (!auth.organizationIds.includes(organizationId)) {
        throw storageAccessDenied('You do not have access to the selected organization');
      }

      setOrganizationCookie(res, config, organizationId);
      res.status(200).json({ activeOrganizationId: organizationId });
    },
  );

  return router;
}
