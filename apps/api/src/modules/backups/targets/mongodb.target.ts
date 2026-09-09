import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath } from '../domain/redact.js';

export function createMongoTarget(): BackupTargetAdapter {
  return {
    target: 'MONGODB',
    scope: 'platform',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const mongoUri = ctx.config.MONGODB_URI;
      if (!mongoUri) {
        await ctx.log('WARN', 'MongoDB backup skipped: MONGODB_URI is not configured');
        return {
          target: 'MONGODB',
          status: 'skipped',
          relativeFiles: [],
          notes: 'MONGODB_URI not configured',
        };
      }

      const dest = componentPath(ctx.workDir, 'mongodb');
      await mkdir(dest, { recursive: true });
      const configPath = join(ctx.workDir, '.mongodump.yaml');
      await writeFile(configPath, `uri: ${JSON.stringify(mongoUri)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const environment = { ...process.env };
          delete environment.MONGODB_URI;
          delete environment.MONGODB_URI_FILE;
          const child = spawn('mongodump', ['--config', configPath, '--out', dest], {
            env: environment,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let stderr = '';
          child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
          });
          child.on('error', reject);
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
              return;
            }
            reject(new Error(`mongodump exited ${code}: ${stderr.trim() || 'no stderr'}`));
          });
        });
        return { target: 'MONGODB', status: 'collected', relativeFiles: ['components/mongodb'] };
      } finally {
        await rm(configPath, { force: true });
      }
    },
  };
}
