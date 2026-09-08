import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type {
  BackupTargetAdapter,
  BackupTargetContext,
  BackupTargetResult,
} from './target.types.js';
import { componentPath } from '../domain/redact.js';

function allowedVolumePaths(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('/'));
}

export function createDockerVolumesTarget(): BackupTargetAdapter {
  return {
    target: 'DOCKER_VOLUMES',
    scope: 'platform',
    async collect(ctx: BackupTargetContext): Promise<BackupTargetResult> {
      const paths = allowedVolumePaths(ctx.config.BACKUP_DOCKER_VOLUME_PATHS);
      if (paths.length === 0) {
        await ctx.log('WARN', 'Docker volume backup skipped: BACKUP_DOCKER_VOLUME_PATHS is empty');
        return {
          target: 'DOCKER_VOLUMES',
          status: 'skipped',
          relativeFiles: [],
          notes: 'BACKUP_DOCKER_VOLUME_PATHS not configured',
        };
      }

      const destDir = componentPath(ctx.workDir, 'docker');
      await mkdir(destDir, { recursive: true });
      const relativeFiles: string[] = [];

      for (const volumePath of paths) {
        const resolved = resolve(volumePath);
        const info = await stat(resolved).catch(() => null);
        if (!info) {
          await ctx.log('WARN', `Docker volume path not found: ${resolved}`);
          continue;
        }
        const dest = join(destDir, basename(resolved));
        if (info.isFile()) {
          await pipeline(createReadStream(resolved), createWriteStream(dest));
          relativeFiles.push(`components/docker/${basename(resolved)}`);
        } else {
          await ctx.log(
            'WARN',
            `Docker volume path is a directory; skipped recursive copy: ${resolved}`,
          );
        }
      }

      return { target: 'DOCKER_VOLUMES', status: 'collected', relativeFiles };
    },
  };
}
