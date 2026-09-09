import { createHmac, randomBytes } from 'node:crypto';
import { CryptoUtil } from './crypto.util.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const SECRET_BYTES = 20;
const BACKUP_COUNT = 8;

export class TotpService {
  generateSecret(): string {
    return encodeBase32(randomBytes(SECRET_BYTES));
  }

  generate(secret: string, at = new Date()): string {
    const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
    return hotp(decodeBase32(secret), counter);
  }

  otpauthUri(email: string, secret: string, issuer = 'VaultStack'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    const query = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(DIGITS),
      period: String(STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }

  generateBackupCodes(): string[] {
    const codes: string[] = [];
    while (codes.length < BACKUP_COUNT) {
      const raw = randomBytes(5).toString('hex').slice(0, 10).toUpperCase();
      codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
    }
    return codes;
  }

  hashBackupCode(code: string): string {
    return CryptoUtil.hashSha256(normalizeBackupCode(code));
  }

  verify(secret: string, code: string, at = new Date()): boolean {
    const normalized = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(normalized)) {
      return false;
    }

    const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
    const key = decodeBase32(secret);
    for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
      if (CryptoUtil.timingSafeEqual(hotp(key, counter + offset), normalized)) {
        return true;
      }
    }
    return false;
  }

  consumeBackupCode(hashes: string[], code: string): string[] | undefined {
    const digest = this.hashBackupCode(code);
    const index = hashes.findIndex((hash) => CryptoUtil.timingSafeEqual(hash, digest));
    if (index < 0) {
      return undefined;
    }

    return hashes.filter((_, current) => current !== index);
  }
}

function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

function hotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buffer.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buffer).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31] ?? '';
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input
    .replace(/=+$/g, '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32.indexOf(char);
    if (index < 0) {
      continue;
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
