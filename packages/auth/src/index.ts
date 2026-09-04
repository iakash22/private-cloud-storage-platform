/**
 * Authentication utilities placeholder.
 * Session management, RBAC, and API key validation will be implemented in a future phase.
 */
export const AUTH_NOT_IMPLEMENTED = 'Authentication is not implemented in Phase 0.';

export interface AuthContextPlaceholder {
  userId: null;
  organizationId: null;
}

export function createEmptyAuthContext(): AuthContextPlaceholder {
  return {
    userId: null,
    organizationId: null,
  };
}
