import { describe, expect, it } from 'vitest';
import { artifactObjectKey, sanitizeArtifactFileName } from './object-key.js';

describe('artifact object keys', () => {
  it('strips path segments and control characters from file names', () => {
    expect(sanitizeArtifactFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeArtifactFileName('release package.tar.gz')).toBe('release_package.tar.gz');
    expect(sanitizeArtifactFileName('...hidden')).toBe('hidden');
    expect(sanitizeArtifactFileName('')).toBe('artifact.bin');
  });

  it('nests keys under ci/{project}/{build}/{artifact}/{version}', () => {
    expect(
      artifactObjectKey({
        projectId: 'proj',
        buildId: 'build',
        artifactId: 'art',
        versionId: 'ver',
        fileName: 'app.tgz',
      }),
    ).toBe('ci/proj/build/art/ver/app.tgz');
  });
});
