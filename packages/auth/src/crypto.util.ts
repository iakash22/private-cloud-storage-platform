import { createHash, timingSafeEqual } from 'node:crypto';

export function hashSha256(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function timingSafeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export const CryptoUtil = {
  hashSha256,
  timingSafeEqual: timingSafeEqualStrings,
};
