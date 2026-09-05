import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { storageAccessDenied } from '../../../../lib/errors.js';

/**
 * Path containment for the local filesystem provider.
 *
 * Physical bucket and object identifiers are always server-generated, so these
 * checks are defence in depth: they guarantee that even a bug elsewhere cannot
 * make the provider touch a path outside the configured storage root.
 */

function assertSafeSegment(segment: string): void {
  if (segment.length === 0) {
    throw storageAccessDenied('Storage path segment must not be empty');
  }

  if (segment.includes('\0')) {
    throw storageAccessDenied('Storage path must not contain null bytes');
  }

  if (isAbsolute(segment) || segment.startsWith('/') || segment.startsWith('\\')) {
    throw storageAccessDenied('Storage path segment must be relative');
  }

  if (/^[a-zA-Z]:/.test(segment)) {
    throw storageAccessDenied('Storage path segment must not contain a drive letter');
  }

  for (const part of segment.split(/[/\\]/)) {
    if (part === '..') {
      throw storageAccessDenied('Storage path must not traverse upwards');
    }
  }
}

/** True when `candidate` is the root itself or lives underneath it. */
export function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);

  if (normalizedCandidate === normalizedRoot) {
    return true;
  }

  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  return normalizedCandidate.startsWith(prefix);
}

/**
 * Joins server-generated segments onto the storage root and verifies the result
 * stays inside it. Throws rather than returning a path outside the root.
 */
export function resolveWithinRoot(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    assertSafeSegment(segment);
  }

  const resolved = resolve(root, ...segments);

  if (!isWithinRoot(root, resolved)) {
    throw storageAccessDenied('Resolved storage path escaped the storage root');
  }

  return resolved;
}

/**
 * Re-checks containment after following symlinks.
 *
 * `resolveWithinRoot` only reasons about the textual path; a symlink inside the
 * root could still point outside it. This resolves the deepest existing
 * ancestor and re-asserts containment, which closes that escape.
 */
export async function assertRealPathWithinRoot(root: string, target: string): Promise<void> {
  const realRoot = await realpath(root);

  let candidate = resolve(target);
  for (;;) {
    try {
      const real = await realpath(candidate);
      if (!isWithinRoot(realRoot, real)) {
        throw storageAccessDenied('Resolved storage path escaped the storage root');
      }
      return;
    } catch (error) {
      if (isNotFound(error)) {
        const parent = resolve(candidate, '..');
        if (parent === candidate) {
          throw storageAccessDenied('Storage root could not be resolved');
        }
        candidate = parent;
        continue;
      }
      throw error;
    }
  }
}

export function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

export function isNotEmpty(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOTEMPTY' || code === 'EEXIST';
}

export function isDiskFull(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOSPC' || code === 'EDQUOT';
}

export function isPermissionDenied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EROFS';
}
