import { describe, expect, it } from 'vitest';
import {
  shareDownloadLimitReached,
  shareFileName,
  shareIsExpired,
  shareIsRevoked,
} from './share-access.js';

describe('share access rules', () => {
  it('returns only the file name, never a path', () => {
    expect(shareFileName('docs/reports/q1.pdf')).toBe('q1.pdf');
    expect(shareFileName('readme.txt')).toBe('readme.txt');
  });

  it('treats expired and revoked links as unusable', () => {
    expect(shareIsExpired(new Date('2020-01-01T00:00:00.000Z'), new Date('2026-01-01'))).toBe(true);
    expect(shareIsExpired(null, new Date('2026-01-01'))).toBe(false);
    expect(shareIsRevoked(new Date('2026-01-01'))).toBe(true);
    expect(shareIsRevoked(null)).toBe(false);
  });

  it('enforces a download limit when configured', () => {
    expect(shareDownloadLimitReached(1, 1)).toBe(true);
    expect(shareDownloadLimitReached(0, 1)).toBe(false);
    expect(shareDownloadLimitReached(99, null)).toBe(false);
  });
});
