import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthenticatedController } from '../../../http/base.controller.js';
import { currentOrganizationId } from '../../../middleware/organization-context.js';
import { forbidden } from '../../../lib/errors.js';
import { asyncHandler, type AsyncRouteHandler } from '../../../lib/async-handler.js';

export class RealtimeController extends AuthenticatedController {
  streamEvents: AsyncRouteHandler = asyncHandler((req: Request, res: Response) => {
    const auth = this.requireAuth(req);
    if (auth.method !== 'session') {
      throw forbidden('Realtime events require a browser session');
    }

    const hub = this.container.realtimeHub;
    if (!hub) {
      res.status(503).json({ code: 'REALTIME_UNAVAILABLE', message: 'Realtime is disabled' });
      return;
    }

    hub.registerConnection({
      connectionId: randomUUID(),
      userId: auth.user.id,
      organizationId: currentOrganizationId(req),
      sessionId: auth.sessionId ?? null,
      response: res,
    });
  });
}
