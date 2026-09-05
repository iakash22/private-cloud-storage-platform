import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  generateCsrfToken,
  generateSessionToken,
  hashApiKey,
  hashPassword,
  hashToken,
  isApiKeyToken,
  parseCookieHeader,
  serializeCookie,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './index.js';

describe('@vaultstack/auth', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('password123', 'test');
    await expect(verifyPassword('password123', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    expect(hash).not.toContain('password123');
  });

  it('signs and verifies access tokens', async () => {
    const secret = 'phase1-test-jwt-secret-value-32chars';
    const token = await signAccessToken('user_123', secret);
    const payload = await verifyAccessToken(token, secret);

    expect(payload.userId).toBe('user_123');
  });

  it('rejects invalid access tokens', async () => {
    await expect(
      verifyAccessToken('not-a-token', 'phase1-test-jwt-secret-value-32chars'),
    ).rejects.toThrow();
  });

  it('generates hashed API keys without storing plaintext', () => {
    const key = generateApiKey();

    expect(isApiKeyToken(key.plaintext)).toBe(true);
    expect(key.hash).toBe(hashApiKey(key.plaintext));
    expect(key.hash).not.toBe(key.plaintext);
    expect(key.prefix).toBe(key.plaintext.slice(0, 12));
  });

  it('serializes httpOnly session cookies and parses them back', () => {
    const token = generateSessionToken();
    const header = serializeCookie({
      name: 'vs_session',
      value: token,
      maxAgeSeconds: 3600,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });

    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Lax');
    expect(header).not.toContain('localStorage');

    const csrf = generateCsrfToken();
    const parsed = parseCookieHeader(
      `vs_session=${encodeURIComponent(token)}; vs_csrf=${encodeURIComponent(csrf)}`,
    );
    expect(parsed.vs_session).toBe(token);
    expect(parsed.vs_csrf).toBe(csrf);
    expect(hashToken(token)).not.toBe(token);
  });
});
