import {
  disableTotpBodySchema,
  enableTotpBodySchema,
  loginBodySchema,
  registerBodySchema,
  selectOrganizationBodySchema,
  verifyTotpLoginBodySchema,
} from '@vaultstack/validation';
import type { Request, Response } from 'express';
import { requestMeta } from '../../../lib/audit.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';
import { storageAccessDenied } from '../../../lib/errors.js';
import { readBody } from '../../../middleware/validate.js';
import { AuthenticatedController } from '../../../http/base.controller.js';

export class AuthController extends AuthenticatedController {
  register: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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

  login: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await this.container.auth.login(readBody(req, loginBodySchema), {
      ...requestMeta(req),
      previousSessionToken: this.container.cookies.readSessionToken(req),
    });

    if (!('session' in result)) {
      this.ok(res, {
        totpRequired: true,
        challengeToken: result.challengeToken,
      });
      return;
    }

    this.container.cookies.setSession(res, result.session);
    this.ok(res, {
      user: result.user,
      organizations: result.organizations,
      memberships: result.memberships,
      csrfToken: result.csrfToken,
    });
  });

  verifyTotpLogin: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const result = await this.container.auth.verifyTotpLogin(
        readBody(req, verifyTotpLoginBodySchema),
        {
          ...requestMeta(req),
          previousSessionToken: this.container.cookies.readSessionToken(req),
        },
      );
      this.container.cookies.setSession(res, result.session);
      this.ok(res, {
        user: result.user,
        organizations: result.organizations,
        memberships: result.memberships,
        csrfToken: result.csrfToken,
      });
    },
  );

  setupTotp: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const result = await this.container.auth.setupTotp(auth.user.id, requestMeta(req));
      this.ok(res, result);
    },
  );

  enableTotp: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const { code } = readBody(req, enableTotpBodySchema);
      const result = await this.container.auth.enableTotp(auth.user.id, code, requestMeta(req));
      this.ok(res, result);
    },
  );

  disableTotp: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const { password, code } = readBody(req, disableTotpBodySchema);
      const result = await this.container.auth.disableTotp(
        auth.user.id,
        password,
        code,
        requestMeta(req),
      );
      this.ok(res, result);
    },
  );

  logout: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    await this.container.auth.logout(auth.user.id, auth.sessionId, requestMeta(req));
    this.container.cookies.clearSession(res);
    this.noContent(res);
  });

  listSessions: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const sessions = await this.container.auth.listSessions(auth.user.id, auth.sessionId);
    this.ok(res, { sessions });
  });

  revokeSession: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const { sessionId } = req.params as { sessionId: string };
    const result = await this.container.auth.revokeSession(
      auth.user.id,
      sessionId,
      auth.sessionId,
      requestMeta(req),
    );
    if (result.revokedCurrent) {
      this.container.cookies.clearSession(res);
    }
    this.ok(res, result);
  });

  revokeOtherSessions: AsyncRouteHandler = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const auth = this.requireAuth(req);
      const result = await this.container.auth.revokeOtherSessions(
        auth.user.id,
        auth.sessionId,
        requestMeta(req),
      );
      this.ok(res, result);
    },
  );

  me: AsyncRouteHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const auth = this.requireAuth(req);
    const result = await this.container.auth.me(auth.user.id);
    this.ok(res, {
      ...result,
      csrfToken: this.container.cookies.readCsrfToken(req),
      activeOrganizationId: this.container.cookies.readOrganizationId(req) ?? null,
    });
  });

  selectOrganization: AsyncRouteHandler = asyncHandler((req: Request, res: Response): void => {
    const auth = this.requireAuth(req);
    const { organizationId } = readBody(req, selectOrganizationBodySchema);

    if (!auth.organizationIds.includes(organizationId)) {
      throw storageAccessDenied('You do not have access to the selected organization');
    }

    this.container.cookies.setOrganization(res, organizationId);
    this.ok(res, { activeOrganizationId: organizationId });
  });
}
