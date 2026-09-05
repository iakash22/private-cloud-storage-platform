import { describe, expect, it } from 'vitest';
import { createAuthorizationService } from './authorization.service.js';

describe('authorization service', () => {
  it('can(user, permission, resource) allows matching org permissions', async () => {
    const service = createAuthorizationService({
      getPermissionKeys: (userId, organizationId) => {
        if (userId === 'user-1' && organizationId === 'org-1') {
          return Promise.resolve(['users.manage']);
        }
        return Promise.resolve([]);
      },
    });

    await expect(
      service.can({ id: 'user-1' }, 'users.manage', {
        type: 'organization',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(true);
  });

  it('denies missing permissions and cross-organization resources', async () => {
    const service = createAuthorizationService({
      getPermissionKeys: (userId, organizationId) => {
        if (userId === 'user-1' && organizationId === 'org-1') {
          return Promise.resolve(['users.read']);
        }
        return Promise.resolve([]);
      },
    });

    await expect(
      service.can({ id: 'user-1' }, 'users.manage', {
        type: 'organization',
        organizationId: 'org-1',
      }),
    ).resolves.toBe(false);

    await expect(
      service.can({ id: 'user-1' }, 'users.read', {
        type: 'organization',
        organizationId: 'org-2',
      }),
    ).resolves.toBe(false);
  });
});
