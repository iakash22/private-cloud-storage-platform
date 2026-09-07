import { describe, expect, it } from 'vitest';
import {
  ApiKeyService,
  CookieSerializer,
  CryptoUtil,
  PasswordService,
  TokenService,
} from './index.js';

describe('auth classes', () => {
  it('PasswordService hashes and verifies', async () => {
    const passwords = new PasswordService('test');
    const hash = await passwords.hash('password123');
    await expect(passwords.verify('password123', hash)).resolves.toBe(true);
    await expect(passwords.verify('wrong', hash)).resolves.toBe(false);
  });

  it('TokenService signs and verifies JWT access tokens', async () => {
    const tokens = new TokenService('phase1-test-jwt-secret-value-32chars');
    const jwt = await tokens.signAccessToken('user_123');
    await expect(tokens.verifyAccessToken(jwt)).resolves.toEqual({ userId: 'user_123' });
  });

  it('ApiKeyService generates hashed keys', () => {
    const apiKeys = new ApiKeyService();
    const key = apiKeys.generate();
    expect(apiKeys.isApiKeyFormat(key.plaintext)).toBe(true);
    expect(key.hash).toBe(apiKeys.hash(key.plaintext));
  });

  it('CookieSerializer round-trips cookies', () => {
    const cookies = new CookieSerializer();
    const session = new TokenService('unused').generateSessionToken();
    const header = cookies.serialize({
      name: 'vs_session',
      value: session,
      maxAgeSeconds: 3600,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    });
    expect(cookies.parse(header).vs_session).toBe(session);
  });

  it('CryptoUtil compares in constant time', () => {
    expect(CryptoUtil.timingSafeEqual('abc', 'abc')).toBe(true);
    expect(CryptoUtil.timingSafeEqual('abc', 'abd')).toBe(false);
  });
});
