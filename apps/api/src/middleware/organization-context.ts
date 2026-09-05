import { ORGANIZATION_COOKIE_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import type { NextFunction, Request, Response } from 'express';
import { readCookies } from '../lib/cookies.js';
import { organizationContextRequired, storageAccessDenied } from '../lib/errors.js';
import { requireAuth } from './authenticate.js';

/**
 * Resolves the active organization for routes that are not nested under
 * /organizations/:organizationId.
 *
 * The cookie (and header) are treated purely as a *selector*, never as
 * authority. The selected id must appear in `auth.organizationIds`, which the
 * authentication middleware derives from persisted role assignments, so a
 * forged or stale value can only ever select an organization the caller is
 * already a member of. Callers still pass through an RBAC permission check
 * afterwards.
 */
export function requireOrganizationContext(req: Request, _res: Response, next: NextFunction): void {
  try {
    const auth = requireAuth(req);

    // API keys are issued per organization, so the key itself pins the scope
    // and any client-supplied selector is ignored.
    if (auth.method === 'api-key') {
      const [organizationId] = auth.organizationIds;
      if (!organizationId) {
        throw organizationContextRequired();
      }
      req.organizationId = organizationId;
      next();
      return;
    }

    const requested =
      readCookies(req)[ORGANIZATION_COOKIE_NAME] ?? req.header(ORGANIZATION_HEADER_NAME);

    if (!requested) {
      // Unambiguous when the caller belongs to exactly one organization.
      if (auth.organizationIds.length === 1) {
        req.organizationId = auth.organizationIds[0];
        next();
        return;
      }
      throw organizationContextRequired();
    }

    if (!auth.organizationIds.includes(requested)) {
      // Deliberately indistinguishable from "no such organization" so the
      // selector cannot be used to probe for organization ids.
      throw storageAccessDenied('You do not have access to the selected organization');
    }

    req.organizationId = requested;
    next();
  } catch (error) {
    next(error);
  }
}

/** Reads the organization resolved by requireOrganizationContext. */
export function currentOrganizationId(req: Request): string {
  if (!req.organizationId) {
    throw organizationContextRequired();
  }
  return req.organizationId;
}
