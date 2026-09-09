import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export function deriveSecretKey(jwtSecret: string, purpose: string): Buffer {
  return createHash('sha256').update(`vaultstack:${purpose}:${jwtSecret}`).digest();
}

export function encryptSecret(
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

export function decryptSecret(ciphertext: string, nonce: string, key: Buffer): string {
  const payload = Buffer.from(ciphertext, 'base64url');
  const iv = Buffer.from(nonce, 'base64url');
  const tag = payload.subarray(payload.length - 16);
  const encrypted = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
