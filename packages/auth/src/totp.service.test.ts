import { describe, expect, it } from 'vitest';
import { TotpService } from './totp.service.js';
import { encryptSecret, decryptSecret, deriveSecretKey } from './secret-box.js';
import { qrSvg } from './qr.js';
import { signTotpChallenge, verifyTotpChallenge } from './index.js';

describe('TotpService', () => {
  const totp = new TotpService();

  it('verifies a code generated for the current time step', () => {
    const secret = totp.generateSecret();
    const now = new Date('2026-09-09T12:00:00.000Z');
    expect(totp.verify(secret, totp.generate(secret, now), now)).toBe(true);
    expect(totp.verify(secret, '000000', now)).toBe(false);
  });

  it('accepts adjacent time windows', () => {
    const secret = totp.generateSecret();
    const now = new Date('2026-09-09T12:00:00.000Z');
    const earlier = new Date(now.getTime() - 30_000);
    expect(totp.verify(secret, totp.generate(secret, earlier), now)).toBe(true);
  });

  it('consumes backup codes once', () => {
    const codes = totp.generateBackupCodes();
    const hashes = codes.map((code) => totp.hashBackupCode(code));
    const first = codes[0];
    if (!first) {
      throw new Error('expected a backup code');
    }
    const remaining = totp.consumeBackupCode(hashes, first.replace('-', '').toLowerCase());
    expect(remaining).toHaveLength(hashes.length - 1);
    expect(totp.consumeBackupCode(remaining ?? [], first)).toBeUndefined();
  });
});

describe('secret box and challenges', () => {
  it('round-trips encrypted secrets', () => {
    const key = deriveSecretKey('jwt-secret-value-for-tests-32ch', 'totp-secret');
    const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(decryptSecret(sealed.ciphertext, sealed.nonce, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('signs a short-lived TOTP login challenge', async () => {
    const secret = 'phase1-test-jwt-secret-value-32chars';
    const token = await signTotpChallenge('user-1', secret);
    await expect(verifyTotpChallenge(token, secret)).resolves.toEqual({ userId: 'user-1' });
  });

  it('renders an svg QR for authenticator enrollment', async () => {
    const svg = await qrSvg('otpauth://totp/VaultStack:user@example.com?secret=JBSWY3DPEHPK3PXP');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
  });
});
