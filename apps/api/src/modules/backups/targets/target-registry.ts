import type { BackupTargetName } from '@vaultstack/types';
import { createAppConfigTarget } from './app-config.target.js';
import { createDockerVolumesTarget } from './docker-volumes.target.js';
import { createMongoTarget } from './mongodb.target.js';
import { createPostgresTarget } from './postgres.target.js';
import type { BackupTargetAdapter } from './target.types.js';
import { createVaultstackMetadataTarget } from './vaultstack-metadata.target.js';
import { createVaultstackObjectMetadataTarget } from './vaultstack-object-metadata.target.js';

export function createDefaultTargetRegistry(
  overrides: Partial<Record<BackupTargetName, BackupTargetAdapter>> = {},
): Record<BackupTargetName, BackupTargetAdapter> {
  return {
    POSTGRESQL: overrides.POSTGRESQL ?? createPostgresTarget(),
    MONGODB: overrides.MONGODB ?? createMongoTarget(),
    APP_CONFIG: overrides.APP_CONFIG ?? createAppConfigTarget(),
    DOCKER_VOLUMES: overrides.DOCKER_VOLUMES ?? createDockerVolumesTarget(),
    VAULTSTACK_METADATA: overrides.VAULTSTACK_METADATA ?? createVaultstackMetadataTarget(),
    VAULTSTACK_OBJECT_METADATA:
      overrides.VAULTSTACK_OBJECT_METADATA ?? createVaultstackObjectMetadataTarget(),
  };
}
