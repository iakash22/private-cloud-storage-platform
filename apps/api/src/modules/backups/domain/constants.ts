/** Logical bucket used for backup archives. Bytes still go through StorageService. */
export const BACKUPS_BUCKET_NAME = 'vs-backups';

export const BACKUP_MANIFEST_VERSION = 1;

export const PLATFORM_BACKUP_TARGETS = [
  'POSTGRESQL',
  'MONGODB',
  'APP_CONFIG',
  'DOCKER_VOLUMES',
] as const;

export const ORGANIZATION_BACKUP_TARGETS = [
  'VAULTSTACK_METADATA',
  'VAULTSTACK_OBJECT_METADATA',
] as const;
