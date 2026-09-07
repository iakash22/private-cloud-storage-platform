import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  deriveCredentialEncryptionKey,
  encryptSecret,
} from './credential-crypto.js';

describe('credential-crypto', () => {
  it('encrypts and decrypts secrets without storing plaintext', () => {
    const key = deriveCredentialEncryptionKey('phase1-test-jwt-secret-value-32chars');
    const encrypted = encryptSecret('super-secret-value', key);
    const decrypted = decryptSecret(encrypted.ciphertext, encrypted.nonce, key);
    expect(decrypted).toBe('super-secret-value');
    expect(encrypted.ciphertext).not.toContain('super-secret-value');
  });
});
