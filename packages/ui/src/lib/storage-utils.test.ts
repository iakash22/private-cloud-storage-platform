import { describe, expect, it } from 'vitest';
import { breadcrumbSegments, formatBytes, sortEntries } from './storage-utils.js';

describe('storage utils', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('builds breadcrumb segments from a prefix', () => {
    expect(breadcrumbSegments('docs/reports/')).toEqual([
      { label: 'Root', prefix: '' },
      { label: 'docs', prefix: 'docs/' },
      { label: 'reports', prefix: 'docs/reports/' },
    ]);
  });

  it('sorts explorer entries', () => {
    const sorted = sortEntries(
      [
        { name: 'b.txt', size: 20, updatedAt: '2026-01-02T00:00:00.000Z' },
        { name: 'a.txt', size: 10, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      'name',
      'asc',
    );

    expect(sorted.map((entry) => entry.name)).toEqual(['a.txt', 'b.txt']);
  });
});
