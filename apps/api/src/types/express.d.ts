import type { AuthContext } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
      /**
       * Active organization for routes that are not nested under
       * /organizations/:organizationId. Populated only by
       * requireOrganizationContext, which validates it against the caller's
       * persisted memberships first.
       */
      organizationId?: string;
    }
  }
}

export {};
