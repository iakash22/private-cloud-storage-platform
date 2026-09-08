import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGzipTarFromDirectory, extractGzipTar, sha256File } from './archive.js';
import {
  canCancelBackupJob,
  canRetryBackupJob,
  shouldCancelBackupJobImmediately,
} from './job-lifecycle.js';
import { selectSnapshotsForRetention } from './retention.js';
import { redactConfigRecord } from './redact.js';
import { isPlatformBackupTarget, requestedPlatformTargets } from './targets.js';

describe('backup domain', () => {
  it('selects expired and excess snapshots for retention', () => {
    const now = new Date('2026-09-08T00:00:00.000Z');
    const snapshots = [
      { id: 'new', createdAt: new Date('2026-09-07T00:00:00.000Z'), expiresAt: null },
      { id: 'old', createdAt: new Date('2026-08-01T00:00:00.000Z'), expiresAt: null },
      {
        id: 'expired',
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
        expiresAt: new Date('2026-09-07T00:00:00.000Z'),
      },
    ];

    expect(
      selectSnapshotsForRetention(snapshots, now, { retentionDays: 14, retentionCount: 1 }),
    ).toEqual(expect.arrayContaining(['old', 'expired']));
  });

  it('redacts secrets from app config snapshots', () => {
    const redacted = redactConfigRecord({
      API_PORT: 3000,
      JWT_SECRET: 'super-secret',
      DATABASE_URL: 'postgresql://vaultstack:secret@localhost:5432/vaultstack',
      MINIO_SECRET_KEY: 'minio',
    });
    expect(redacted.API_PORT).toBe(3000);
    expect(redacted.JWT_SECRET).toBe('[REDACTED]');
    expect(redacted.DATABASE_URL).toBe('[REDACTED]');
    expect(redacted.MINIO_SECRET_KEY).toBe('[REDACTED]');
  });

  it('enforces cancel and retry state transitions', () => {
    expect(canCancelBackupJob('QUEUED')).toBe(true);
    expect(canCancelBackupJob('RUNNING')).toBe(true);
    expect(canCancelBackupJob('VERIFYING')).toBe(true);
    expect(canCancelBackupJob('COMPLETED')).toBe(false);
    expect(canCancelBackupJob('FAILED')).toBe(false);
    expect(canCancelBackupJob('CANCELLED')).toBe(false);
    expect(shouldCancelBackupJobImmediately('QUEUED')).toBe(true);
    expect(shouldCancelBackupJobImmediately('RUNNING')).toBe(false);
    expect(canRetryBackupJob('FAILED')).toBe(true);
    expect(canRetryBackupJob('COMPLETED')).toBe(false);
    expect(canRetryBackupJob('QUEUED')).toBe(false);
  });

  it('classifies platform backup targets', () => {
    expect(isPlatformBackupTarget('POSTGRESQL')).toBe(true);
    expect(isPlatformBackupTarget('VAULTSTACK_METADATA')).toBe(false);
    expect(requestedPlatformTargets(['VAULTSTACK_METADATA', 'APP_CONFIG'])).toEqual(['APP_CONFIG']);
  });

  it('round-trips a gzip tar archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vaultstack-tar-'));
    const source = join(root, 'src');
    const dest = join(root, 'out.tar.gz');
    const extract = join(root, 'extract');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'hello.txt'), 'hello-backup');
    const packed = await createGzipTarFromDirectory(source, dest);
    expect(packed.size).toBeGreaterThan(0);
    expect(packed.sha256).toHaveLength(64);
    expect(await sha256File(dest)).toBe(packed.sha256);
    await extractGzipTar(dest, extract);
    expect(await readFile(join(extract, 'hello.txt'), 'utf8')).toBe('hello-backup');
    await rm(root, { recursive: true, force: true });
  });
});
