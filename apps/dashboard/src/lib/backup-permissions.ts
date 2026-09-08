import { PERMISSIONS } from '@vaultstack/types';
import { hasPermission } from './storage-preferences.js';

export function canReadBackups(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.BACKUP_READ);
}

export function canCreateBackups(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.BACKUP_CREATE);
}

export function canDeleteBackups(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.BACKUP_DELETE);
}

export function canRestoreBackups(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.BACKUP_RESTORE);
}
