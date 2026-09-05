import type { AuthUser } from '@vaultstack/types';

export interface AuthContext {
  user: AuthUser;
  organizationIds: string[];
  apiKeyId?: string;
}
