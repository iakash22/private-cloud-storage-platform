import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGzipTarFromDirectory } from '../domain/archive.js';
import { BACKUP_MANIFEST_VERSION } from '../domain/constants.js';
import {
  BackupVerificationError,
  verifyArchiveFile,
  verifyExtractedBackup,
  type BackupManifest,
} from './backup-verifier.js';

describe('backup verifier', () => {
  it('accepts a valid archive and rejects a corrupt member', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vaultstack-verify-'));
    const bundle = join(root, 'bundle');
    await mkdir(join(bundle, 'components'), { recursive: true });
    await writeFile(join(bundle, 'components', 'data.txt'), 'payload');

    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const member = await readFile(join(bundle, 'components', 'data.txt'));
    const manifest: BackupManifest = {
      version: BACKUP_MANIFEST_VERSION,
      organizationId: 'org-1',
      jobId: 'job-1',
      targets: ['VAULTSTACK_METADATA'],
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'components/data.txt',
          sha256: createHash('sha256').update(member).digest('hex'),
          size: member.length,
        },
      ],
    };
    await writeFile(join(bundle, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const archive = join(root, 'backup.tar.gz');
    const packed = await createGzipTarFromDirectory(bundle, archive);
    const verified = await verifyArchiveFile(archive, packed.sha256);
    expect(verified.jobId).toBe('job-1');

    await writeFile(join(bundle, 'components', 'data.txt'), 'tampered');
    await expect(verifyExtractedBackup(bundle)).rejects.toBeInstanceOf(BackupVerificationError);

    await rm(root, { recursive: true, force: true });
  });
});
