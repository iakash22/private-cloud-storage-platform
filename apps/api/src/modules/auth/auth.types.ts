import type { AuthUser } from '@vaultstack/types';

export type AuthMethod = 'session' | 'jwt' | 'api-key';

export interface AuthContext {
  user: AuthUser;
  organizationIds: string[];
  apiKeyId?: string;
  sessionId?: string;
  method: AuthMethod;
}
