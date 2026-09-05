import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS, type HealthResponse } from './index.js';

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

  it('includes organization and user permission keys', () => {
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.ORGANIZATIONS_READ);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.USERS_CREATE);
    expect(ALL_PERMISSIONS).toContain(PERMISSIONS.ROLES_ASSIGN);
  });
});
