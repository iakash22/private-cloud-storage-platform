import type { BackupTargetName } from '@vaultstack/types';
import { PLATFORM_BACKUP_TARGETS } from './constants.js';

export function isPlatformBackupTarget(target: BackupTargetName): boolean {
  return (PLATFORM_BACKUP_TARGETS as readonly string[]).includes(target);
}

export function requestedPlatformTargets(targets: BackupTargetName[]): BackupTargetName[] {
  return targets.filter(isPlatformBackupTarget);
}
