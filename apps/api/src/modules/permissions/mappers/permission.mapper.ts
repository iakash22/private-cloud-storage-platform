import type { PublicPermission } from '@vaultstack/types';

export function serializePermission(permission: {
  id: string;
  key: string;
  description: string;
}): PublicPermission {
  return {
    id: permission.id,
    key: permission.key,
    description: permission.description,
  };
}
