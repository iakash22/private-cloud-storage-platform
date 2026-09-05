import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  isApiKeyToken,
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
});
