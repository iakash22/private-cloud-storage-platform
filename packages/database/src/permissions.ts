import { ALL_PERMISSIONS, type PermissionKey } from '@vaultstack/types';

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'organizations:read': 'Read organization details',
  'organizations:update': 'Update organization details',
  'users:read': 'Read users in the organization',
  'users:create': 'Create users in the organization',
  'users:update': 'Update users in the organization',
  'teams:read': 'Read teams',
  'teams:create': 'Create teams',
  'teams:update': 'Update teams',
  'teams:delete': 'Delete teams',
  'roles:read': 'Read roles',
  'roles:create': 'Create roles',
  'roles:update': 'Update roles',
  'roles:assign': 'Assign roles to users',
  'permissions:read': 'Read the permission catalog',
  'api-keys:read': 'Read API keys',
  'api-keys:create': 'Create API keys',
  'api-keys:revoke': 'Revoke API keys',
  'audit:read': 'Read audit logs',
};

export const SEEDED_PERMISSION_KEYS = ALL_PERMISSIONS;
