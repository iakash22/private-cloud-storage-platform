import { fileURLToPath } from 'node:url';
import { loadEnv } from '@vaultstack/config';
import { createLogger } from '@vaultstack/logger';

export const BACKUP_QUEUE_NAME = 'backup-jobs';

function main(): void {
  const config = loadEnv();
  const logger = createLogger({ name: 'backup-worker', level: config.LOG_LEVEL });
  logger.info(
    { queue: BACKUP_QUEUE_NAME },
    'Backup jobs are processed by the API worker (`pnpm --filter @vaultstack/api worker:cleanup`). This package keeps the shared queue name.',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error: unknown) {
    console.error(error);
    process.exit(1);
  }
}
