import { SYSTEM_ROLES } from '@vaultstack/types';

export function isSuperAdminRole(name: string, isSystem: boolean): boolean {
  return isSystem && name === SYSTEM_ROLES.SUPER_ADMIN;
}

export function canGrantPermissions(
  actorPermissions: readonly string[],
  actorIsSuperAdmin: boolean,
  targetPermissions: readonly string[],
): boolean {
  if (actorIsSuperAdmin) {
    return true;
  }

  return targetPermissions.every((permission) => actorPermissions.includes(permission));
}

export function canAssignSystemRole(
  actorIsSuperAdmin: boolean,
  roleName: string,
  isSystem: boolean,
): boolean {
  if (!isSuperAdminRole(roleName, isSystem)) {
    return true;
  }
  return actorIsSuperAdmin;
}
