import { loginBodySchema, registerBodySchema, selectOrganizationBodySchema } from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler } from '../../../lib/async-handler.js';
import { storageAccessDenied } from '../../../lib/errors.js';
import { readBody } from '../../../middleware/validate.js';
import { AuthenticatedController } from '../../../http/base.controller.js';
import type { AppContainer } from '../../../container/app-container.js';

export class AuthController extends AuthenticatedController {
  constructor(container: AppContainer) {
    super(container);
  }

  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await this.container.auth.register(readBody(req, registerBodySchema), {
      ...requestMeta(req),
      previousSessionToken: this.container.cookies.readSessionToken(req),
    });
    this.container.cookies.setSession(res, result.session);
    this.created(res, {
      user: result.user,
      organization: result.organization,
      organizations: result.organizations,
      memberships: result.memberships,
      csrfToken: result.csrfToken,
    });
  });

  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await this.container.auth.login(readBody(req, loginBodySchema), {
      ...requestMeta(req),
      previousSessionToken: this.container.cookies.readSessionToken(req),
    });
    this.container.cookies.setSession(res, result.session);
    this.ok(res, {
      user: result.user,
      organizations: result.organizations,
      memberships: result.memberships,
      csrfToken: result.csrfToken,
    });
  });

  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.auth.logout(auth.user.id, auth.sessionId, requestMeta(req));
    this.container.cookies.clearSession(res);
    this.noContent(res);
  });

  me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const result = await this.container.auth.me(auth.user.id);
    this.ok(res, {
      ...result,
      csrfToken: this.container.cookies.readCsrfToken(req),
      activeOrganizationId: this.container.cookies.readOrganizationId(req) ?? null,
    });
  });

  selectOrganization = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const { organizationId } = readBody(req, selectOrganizationBodySchema);

    if (!auth.organizationIds.includes(organizationId)) {
      throw storageAccessDenied('You do not have access to the selected organization');
    }

    this.container.cookies.setOrganization(res, organizationId);
    this.ok(res, { activeOrganizationId: organizationId });
  });
}
