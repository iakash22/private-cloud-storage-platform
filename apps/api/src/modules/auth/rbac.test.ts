import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { canAssignSystemRole, canGrantPermissions, isSuperAdminRole } from './rbac.js';

describe('RBAC privilege guards', () => {
  it('identifies SUPER_ADMIN system roles', () => {
    expect(isSuperAdminRole('SUPER_ADMIN', true)).toBe(true);
    expect(isSuperAdminRole('SUPER_ADMIN', false)).toBe(false);
    expect(isSuperAdminRole('ADMIN', true)).toBe(false);
  });

  it('prevents granting permissions the actor does not have', () => {
    expect(
      canGrantPermissions([PERMISSIONS.USERS_READ], false, [
        PERMISSIONS.USERS_READ,
        PERMISSIONS.USERS_MANAGE,
      ]),
    ).toBe(false);
    expect(canGrantPermissions([PERMISSIONS.USERS_READ], false, [PERMISSIONS.USERS_READ])).toBe(
      true,
    );
    expect(canGrantPermissions([], true, [PERMISSIONS.USERS_MANAGE])).toBe(true);
  });

  it('prevents assigning SUPER_ADMIN unless the actor is SUPER_ADMIN', () => {
    expect(canAssignSystemRole(false, 'SUPER_ADMIN', true)).toBe(false);
    expect(canAssignSystemRole(true, 'SUPER_ADMIN', true)).toBe(true);
    expect(canAssignSystemRole(false, 'VIEWER', true)).toBe(true);
  });
});
