import { PERMISSIONS } from '@vaultstack/types';

export function canReadArtifacts(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.ARTIFACT_READ);
}

export function canReadAccess(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.USERS_READ);
}

export function canReadActivity(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.AUDIT_READ);
}

export function canReadSettings(permissions: string[]): boolean {
  return (
    permissions.includes(PERMISSIONS.USERS_MANAGE) ||
    permissions.includes(PERMISSIONS.STORAGE_UPLOAD) ||
    permissions.includes(PERMISSIONS.BACKUP_CREATE) ||
    permissions.includes(PERMISSIONS.INFRASTRUCTURE_MANAGE)
  );
}
