import { describe, expect, it } from 'vitest';
import {
  decryptProviderSecret,
  deriveStorageProviderEncryptionKey,
  encryptProviderSecret,
} from './provider-crypto.js';
import { deriveCredentialEncryptionKey } from '../../../s3-gateway/credential-crypto.js';

describe('storage provider secret crypto', () => {
  it('round-trips a secret and uses a distinct key from S3 gateway credentials', () => {
    const jwtSecret = 'phase9-test-jwt-secret-value-32ch';
    const key = deriveStorageProviderEncryptionKey(jwtSecret);
    const gatewayKey = deriveCredentialEncryptionKey(jwtSecret);

    expect(key.equals(gatewayKey)).toBe(false);

    const encrypted = encryptProviderSecret('super-secret-key', key);
    expect(encrypted.ciphertext).not.toContain('super-secret-key');
    expect(decryptProviderSecret(encrypted.ciphertext, encrypted.nonce, key)).toBe(
      'super-secret-key',
    );
  });
});
