import { createHash, timingSafeEqual } from 'node:crypto';

export class CryptoUtil {
  static hashSha256(plaintext: string): string {
    return createHash('sha256').update(plaintext).digest('hex');
  }

  static timingSafeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
