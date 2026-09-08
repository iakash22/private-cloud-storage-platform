import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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

      await new Promise<void>((resolve, reject) => {
        const child = spawn('mongodump', ['--uri', mongoUri, '--out', dest], {
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
    },
  };
}
