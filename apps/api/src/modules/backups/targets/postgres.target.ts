import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath } from '../domain/redact.js';

function runToFile(
  command: string,
  args: string[],
  outFile: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = createWriteStream(outFile);
    child.stdout.pipe(output);
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      output.end();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });
  });
}

export function createPostgresTarget(): BackupTargetAdapter {
  return {
    target: 'POSTGRESQL',
    scope: 'platform',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const dest = componentPath(ctx.workDir, 'postgres.dump');
      await mkdir(dirname(dest), { recursive: true });
      try {
        await runToFile(
          'pg_dump',
          ['--no-owner', '--format=custom', `--dbname=${ctx.config.DATABASE_URL}`],
          dest,
          process.env,
        );
        return {
          target: 'POSTGRESQL',
          status: 'collected',
          relativeFiles: ['components/postgres.dump'],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`PostgreSQL backup failed: ${message}`);
      }
    },
  };
}
