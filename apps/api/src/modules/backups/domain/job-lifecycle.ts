import type { BackupJobStatusName } from '@vaultstack/types';

const TERMINAL_STATUSES: readonly BackupJobStatusName[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export function canCancelBackupJob(status: BackupJobStatusName): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

export function shouldCancelBackupJobImmediately(status: BackupJobStatusName): boolean {
  return status === 'QUEUED';
}

export function canRetryBackupJob(status: BackupJobStatusName): boolean {
  return status === 'FAILED';
}
