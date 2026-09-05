import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../../lib/errors.js';
import { assertRealPathWithinRoot, isWithinRoot, resolveWithinRoot } from './safe-path.js';

describe('isWithinRoot', () => {
  it('treats the root itself as contained', () => {
    expect(isWithinRoot('/srv/vaultstack', '/srv/vaultstack')).toBe(true);
  });

  it('accepts descendants', () => {
    expect(isWithinRoot('/srv/vaultstack', '/srv/vaultstack/objects/a')).toBe(true);
  });

  it('rejects escapes and sibling directories with a shared name prefix', () => {
    expect(isWithinRoot('/srv/vaultstack', '/srv/vaultstack-evil/objects')).toBe(false);
    expect(isWithinRoot('/srv/vaultstack', '/srv')).toBe(false);
    expect(isWithinRoot('/srv/vaultstack', '/etc/passwd')).toBe(false);
  });
});

describe('resolveWithinRoot', () => {
  const root = '/srv/vaultstack/data';

  it('joins server-generated segments below the root', () => {
    expect(resolveWithinRoot(root, 'objects', 'org-1', 'obj-1')).toBe(
      resolve(root, 'objects/org-1/obj-1'),
    );
  });

  it('rejects upward traversal', () => {
    for (const segment of ['..', '../..', 'objects/../../etc', 'a/../../..']) {
      expect(() => resolveWithinRoot(root, segment)).toThrow(AppError);
    }
  });

  it('rejects absolute segments so they cannot replace the root', () => {
    // path.resolve() would silently discard the root for an absolute segment.
    for (const segment of ['/etc/passwd', '\\windows']) {
      expect(() => resolveWithinRoot(root, segment)).toThrow(AppError);
    }
  });

  it('rejects drive letters, null bytes and empty segments', () => {
    for (const segment of ['C:\\Windows', 'obj\0ect', '']) {
      expect(() => resolveWithinRoot(root, segment)).toThrow(AppError);
    }
  });

  it('reports STORAGE_ACCESS_DENIED rather than leaking a path', () => {
    try {
      resolveWithinRoot(root, '../../etc');
      throw new Error('expected rejection');
    } catch (error) {
      expect((error as AppError).code).toBe('STORAGE_ACCESS_DENIED');
    }
  });
});

describe('assertRealPathWithinRoot', () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), 'vaultstack-safe-path-'));
    root = join(base, 'root');
    outside = join(base, 'outside');
    await mkdir(root, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'secret.txt'), 'secret');
  });

  afterEach(() => {
    root = '';
    outside = '';
  });

  it('accepts real paths inside the root', async () => {
    const target = join(root, 'objects', 'data');
    await mkdir(join(root, 'objects'), { recursive: true });
    await writeFile(target, 'ok');

    await expect(assertRealPathWithinRoot(root, target)).resolves.toBeUndefined();
  });

  it('accepts paths that do not exist yet, by checking their nearest ancestor', async () => {
    await expect(
      assertRealPathWithinRoot(root, join(root, 'objects', 'not-created-yet', 'data')),
    ).resolves.toBeUndefined();
  });

  it('rejects a symlinked file that points outside the root', async () => {
    const link = join(root, 'escape.txt');
    await symlink(join(outside, 'secret.txt'), link);

    await expect(assertRealPathWithinRoot(root, link)).rejects.toThrow(AppError);
  });

  it('rejects a path whose parent directory is a symlink out of the root', async () => {
    // The textual path still looks contained here, which is exactly the case
    // resolveWithinRoot cannot catch on its own.
    const link = join(root, 'linked-dir');
    await symlink(outside, link);

    await expect(assertRealPathWithinRoot(root, join(link, 'secret.txt'))).rejects.toThrow(
      AppError,
    );
  });
});
