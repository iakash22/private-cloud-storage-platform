import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function getDatabasePackageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

export async function applyMigrations(databaseUrl: string): Promise<void> {
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: getDatabasePackageRoot(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
