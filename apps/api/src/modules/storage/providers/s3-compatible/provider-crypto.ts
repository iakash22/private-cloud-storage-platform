import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives the AES-256-GCM key used for organization-stored provider secrets.
 *
 * The purpose prefix is distinct from S3 gateway credential encryption so a
 * leaked gateway ciphertext cannot be decrypted as a storage-provider secret
 * (and vice versa).
 */
export function deriveStorageProviderEncryptionKey(jwtSecret: string): Buffer {
  return createHash('sha256').update(`vaultstack:storage-provider:${jwtSecret}`).digest();
}

export function encryptProviderSecret(
  plaintext: string,
  key: Buffer,
): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    nonce: nonce.toString('base64url'),
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64url'),
  };
}

export function decryptProviderSecret(ciphertext: string, nonce: string, key: Buffer): string {
  const payload = Buffer.from(ciphertext, 'base64url');
  const iv = Buffer.from(nonce, 'base64url');
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
