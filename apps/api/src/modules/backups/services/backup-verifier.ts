import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { BackupRestorePlan, BackupTargetName } from '@vaultstack/types';
import { extractGzipTar, sha256File } from '../domain/archive.js';
import { BACKUP_MANIFEST_VERSION } from '../domain/constants.js';

export interface BackupManifestFile {
  path: string;
  sha256: string;
  size: number;
}

export interface BackupManifest {
  version: number;
  organizationId: string;
  jobId: string;
  targets: BackupTargetName[];
  createdAt: string;
  files: BackupManifestFile[];
}

export class BackupVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupVerificationError';
  }
}

export async function readManifest(extractDir: string): Promise<BackupManifest> {
  const raw = await readFile(join(extractDir, 'manifest.json'), 'utf8').catch(() => {
    throw new BackupVerificationError('manifest.json is missing');
  });
  const parsed = JSON.parse(raw) as BackupManifest;
  if (parsed.version !== BACKUP_MANIFEST_VERSION || !Array.isArray(parsed.files)) {
    throw new BackupVerificationError('manifest.json is invalid');
  }
  return parsed;
}

export async function verifyExtractedBackup(
  extractDir: string,
  expectedArchiveSha256?: string,
  archiveSha256?: string,
): Promise<BackupManifest> {
  if (expectedArchiveSha256 && archiveSha256 && expectedArchiveSha256 !== archiveSha256) {
    throw new BackupVerificationError('Archive checksum mismatch');
  }

  const manifest = await readManifest(extractDir);
  for (const file of manifest.files) {
    if (file.path.includes('..')) {
      throw new BackupVerificationError(`Unsafe manifest path: ${file.path}`);
    }
    const actual = await sha256File(join(extractDir, file.path)).catch(() => {
      throw new BackupVerificationError(`Missing backup member: ${file.path}`);
    });
    if (actual !== file.sha256) {
      throw new BackupVerificationError(`Checksum mismatch for ${file.path}`);
    }
  }
  return manifest;
}

export async function verifyArchiveFile(
  archivePath: string,
  expectedArchiveSha256: string,
): Promise<BackupManifest> {
  const archiveSha256 = await sha256File(archivePath);
  const extractDir = join(
    tmpdir(),
    `vaultstack-verify-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await mkdir(extractDir, { recursive: true });
  try {
    await extractGzipTar(archivePath, extractDir);
    return await verifyExtractedBackup(extractDir, expectedArchiveSha256, archiveSha256);
  } finally {
    await rm(extractDir, { recursive: true, force: true });
  }
}

export function buildRestorePlan(manifest: BackupManifest, snapshotId: string): BackupRestorePlan {
  return {
    snapshotId,
    jobId: manifest.jobId,
    targets: manifest.targets,
    components: manifest.files.map((file) => ({
      path: file.path,
      checksum: file.sha256,
      restorable: true,
      notes: 'Listed for restore planning only; live restore is deferred to Phase 22.',
    })),
    warnings: [
      'This restore job builds a plan only. PostgreSQL, MongoDB, and volume restore are not executed.',
    ],
    destructive: false,
  };
}
