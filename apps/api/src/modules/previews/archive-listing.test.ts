import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { listArchive } from './archive-listing.js';

describe('listArchive', () => {
  it('lists ZIP members without extracting them to storage', () => {
    const archive = zipSync({
      'docs/readme.txt': new TextEncoder().encode('hello'),
      'images/': new Uint8Array(),
    });

    expect(listArchive(archive, 'bundle.zip')).toEqual([
      { name: 'docs/readme.txt', type: 'file', size: 5 },
      { name: 'images/', type: 'directory', size: 0 },
    ]);
  });

  it('rejects traversal paths', () => {
    const archive = zipSync({ '../secret.txt': new Uint8Array([1]) });
    expect(() => listArchive(archive, 'bundle.zip')).toThrow('unsafe path');
  });
});
