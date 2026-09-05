import { ALL_PERMISSIONS, type PermissionKey } from '@vaultstack/types';

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  'storage.read': 'Read stored objects and prefixes',
  'storage.upload': 'Upload and overwrite stored objects',
  'storage.delete': 'Delete stored objects',
  'storage.share': 'Create and manage object shares',
  'artifact.read': 'Read CI artifacts',
  'artifact.upload': 'Upload CI artifacts',
  'artifact.delete': 'Delete CI artifacts',
  'backup.read': 'Read backup jobs and metadata',
  'backup.create': 'Create backup jobs',
  'backup.restore': 'Restore from backups',
  'backup.delete': 'Delete backups',
  'infrastructure.read': 'Read infrastructure and monitoring status',
  'infrastructure.manage': 'Change infrastructure settings',
  'users.read': 'Read users, teams, roles, and organization details',
  'users.manage': 'Create and manage users, teams, roles, and API keys',
  'audit.read': 'Read audit logs',
};

export const SEEDED_PERMISSION_KEYS = ALL_PERMISSIONS;
