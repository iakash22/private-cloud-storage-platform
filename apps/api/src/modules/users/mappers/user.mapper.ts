import type { PublicUser } from '@vaultstack/types';

export function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  disabledAt?: Date | null;
  totpEnabledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    disabled: user.disabledAt != null,
    twoFactorEnabled: user.totpEnabledAt != null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
