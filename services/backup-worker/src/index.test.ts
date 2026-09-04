import { describe, expect, it } from 'vitest';
import { BACKUP_QUEUE_NAME } from './index.js';

describe('@vaultstack/backup-worker', () => {
  it('defines the backup queue name', () => {
    expect(BACKUP_QUEUE_NAME).toBe('backup-jobs');
  });
});
