import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath, redactConfigRecord, writeJsonFile } from '../domain/redact.js';

export function createAppConfigTarget(): BackupTargetAdapter {
  return {
    target: 'APP_CONFIG',
    scope: 'platform',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const snapshot = redactConfigRecord(Object.fromEntries(Object.entries(ctx.config)));
      const dest = componentPath(ctx.workDir, 'app-config.json');
      await writeJsonFile(dest, {
        capturedAt: new Date().toISOString(),
        config: snapshot,
      });
      return {
        target: 'APP_CONFIG',
        status: 'collected',
        relativeFiles: ['components/app-config.json'],
      };
    },
  };
}
