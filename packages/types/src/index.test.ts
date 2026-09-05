import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  ALL_SYSTEM_ROLES,
  PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  type HealthResponse,
} from './index.js';

describe('@vaultstack/types', () => {
  it('exports health response shape', () => {
    const health: HealthResponse = {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptime: 0,
    };

    expect(health.status).toBe('ok');
  });

  it('includes Phase 2 permission keys', () => {
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.STORAGE_READ);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.USERS_MANAGE);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.AUDIT_READ);
    expect(ALL_PERMISSIONS).toHaveLength(16);
  });

  it('defines the six system roles and SUPER_ADMIN has every permission', () => {
    expect(ALL_SYSTEM_ROLES).toEqual([
      SYSTEM_ROLES.SUPER_ADMIN,
      SYSTEM_ROLES.ADMIN,
      SYSTEM_ROLES.STORAGE_ADMIN,
      SYSTEM_ROLES.BACKUP_ADMIN,
      SYSTEM_ROLES.DEVELOPER,
      SYSTEM_ROLES.VIEWER,
    ]);
    expect(SYSTEM_ROLE_PERMISSIONS.SUPER_ADMIN).toEqual(ALL_PERMISSIONS);
    expect(SYSTEM_ROLE_PERMISSIONS.VIEWER).not.toContain(PERMISSIONS.USERS_MANAGE);
  });
});
