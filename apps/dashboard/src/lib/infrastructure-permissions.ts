import { PERMISSIONS } from '@vaultstack/types';
import { hasPermission } from './storage-preferences.js';

export function canReadInfrastructure(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.INFRASTRUCTURE_READ);
}
