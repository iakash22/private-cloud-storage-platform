import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { BackupLogLevelName, BackupTargetName } from '@vaultstack/types';

export interface BackupTargetResult {
  target: BackupTargetName;
  status: 'collected' | 'skipped';
  relativeFiles: string[];
  notes?: string;
}

export interface BackupTargetContext {
  organizationId: string;
  jobId: string;
  workDir: string;
  prisma: PrismaClient;
  config: EnvConfig;
  logger: Logger;
  log: (level: BackupLogLevelName, message: string) => Promise<void>;
}

export interface BackupTargetAdapter {
  readonly target: BackupTargetName;
  readonly scope: 'organization' | 'platform';
  collect(ctx: BackupTargetContext): Promise<BackupTargetResult>;
}
