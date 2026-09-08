import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import { createStorageTokenService } from './storage-token.service.js';

const SECRET = 'test-secret-value-at-least-32-characters';
const OTHER_SECRET = 'another-secret-value-at-least-32-chars!!';

function claimsFor(overrides: Partial<{ organizationId: string; subjectId: string }> = {}) {
  return {
    purpose: 'download' as const,
    organizationId: overrides.organizationId ?? 'org-1',
    subjectId: overrides.subjectId ?? 'obj-1',
  };
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('Expected the token to be rejected but it was accepted');
}

describe('storage token service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips the claims it was issued with', () => {
    const service = createStorageTokenService(SECRET);

    const { token, expiresAt } = service.issue(claimsFor(), 300);
    const verified = service.verify(token, 'download');

    expect(verified.organizationId).toBe('org-1');
    expect(verified.subjectId).toBe('obj-1');
    expect(verified.purpose).toBe('download');
    // The token carries a whole-second expiry, so the verified value is the
    // issued one truncated to the second.
    expect(verified.expiresAt.getTime()).toBe(Math.floor(expiresAt.getTime() / 1000) * 1000);
  });

  it('never embeds a storage credential or the signing secret in the token', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 300);

    const decoded = Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8');

    expect(token).not.toContain(SECRET);
    expect(decoded).not.toContain(SECRET);
    // Only the scoping claims are present.
    expect(Object.keys(JSON.parse(decoded) as object).sort()).toEqual(['e', 'g', 'n', 'p', 's']);
  });

  it('issues distinct tokens for identical claims', () => {
    const service = createStorageTokenService(SECRET);

    const first = service.issue(claimsFor(), 300).token;
    const second = service.issue(claimsFor(), 300).token;

    expect(first).not.toBe(second);
  });

  it('rejects a token signed with a different secret', () => {
    const issuer = createStorageTokenService(OTHER_SECRET);
    const verifier = createStorageTokenService(SECRET);
    const { token } = issuer.issue(claimsFor(), 300);

    expect(codeOf(() => verifier.verify(token, 'download'))).toBe('STORAGE_ACCESS_DENIED');
  });

  it('rejects a tampered payload, so claims cannot be rewritten', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 300);
    const [, signature] = token.split('.');

    // Re-encode the claims pointing at another organization's object.
    const forged = Buffer.from(
      JSON.stringify({ p: 'download', g: 'org-2', s: 'obj-2', e: 4_000_000_000, n: 'aa' }),
    ).toString('base64url');

    expect(codeOf(() => service.verify(`${forged}.${signature ?? ''}`, 'download'))).toBe(
      'STORAGE_ACCESS_DENIED',
    );
  });

  it('rejects a token whose signature has been altered', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 300);

    expect(codeOf(() => service.verify(`${token}x`, 'download'))).toBe('STORAGE_ACCESS_DENIED');
  });

  it('rejects malformed tokens', () => {
    const service = createStorageTokenService(SECRET);

    for (const token of ['', 'no-separator', '.only-signature']) {
      expect(codeOf(() => service.verify(token, 'download'))).toBe('STORAGE_ACCESS_DENIED');
    }
  });

  it('refuses to use a download token for an upload', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 300);

    expect(codeOf(() => service.verify(token, 'upload'))).toBe('STORAGE_ACCESS_DENIED');
  });

  it('rejects an expired token, which is what makes URLs short-lived', () => {
    vi.useFakeTimers();
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 60);

    vi.advanceTimersByTime(61_000);

    expect(codeOf(() => service.verify(token, 'download'))).toBe('STORAGE_UPLOAD_EXPIRED');
  });

  it('rejects a replayed token once it has expired', () => {
    vi.useFakeTimers();
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 60);

    // Valid while inside the window...
    expect(service.verify(token, 'download').subjectId).toBe('obj-1');

    vi.advanceTimersByTime(120_000);

    // ...and worthless afterwards, even though it is byte-identical.
    expect(codeOf(() => service.verify(token, 'download'))).toBe('STORAGE_UPLOAD_EXPIRED');
  });

  it('rejects a token that expires exactly now', () => {
    vi.useFakeTimers();
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(claimsFor(), 1);

    vi.advanceTimersByTime(1_000);

    expect(codeOf(() => service.verify(token, 'download'))).toBe('STORAGE_UPLOAD_EXPIRED');
  });

  it('binds a multipart part token to organization, upload, and part number', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(
      {
        purpose: 'multipart-part',
        organizationId: 'org-1',
        subjectId: 'upload-1',
        partNumber: 3,
      },
      300,
    );

    const verified = service.verify(token, 'multipart-part');
    expect(verified.subjectId).toBe('upload-1');
    expect(verified.partNumber).toBe(3);
    expect(codeOf(() => service.verify(token, 'upload'))).toBe('STORAGE_ACCESS_DENIED');
  });

  it('binds a download token to a specific object version', () => {
    const service = createStorageTokenService(SECRET);
    const { token } = service.issue(
      {
        purpose: 'download',
        organizationId: 'org-1',
        subjectId: 'obj-1',
        versionId: 'version-2',
      },
      300,
    );

    const verified = service.verify(token, 'download');
    expect(verified.versionId).toBe('version-2');
    expect(verified.subjectId).toBe('obj-1');
  });
});
