import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { CryptoUtil } from './crypto.util.js';
import {
  ACCESS_TOKEN_TYP,
  CSRF_TOKEN_PREFIX,
  SESSION_TOKEN_PREFIX,
  TOTP_CHALLENGE_TYP,
  type AccessTokenPayload,
} from './types.js';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export class TokenService {
  constructor(private readonly jwtSecret: string) {}

  generateSessionToken(): string {
    return `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
  }

  generateCsrfToken(): string {
    return `${CSRF_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
  }

  hashToken(plaintext: string): string {
    return CryptoUtil.hashSha256(plaintext);
  }

  async signAccessToken(userId: string, expiresIn = '12h'): Promise<string> {
    return new SignJWT({ typ: ACCESS_TOKEN_TYP })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secretKey(this.jwtSecret));
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, secretKey(this.jwtSecret));

    if (
      payload.typ !== ACCESS_TOKEN_TYP ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0
    ) {
      throw new Error('Invalid access token');
    }

    return { userId: payload.sub };
  }

  async signTotpChallenge(userId: string, expiresIn = '5m'): Promise<string> {
    return new SignJWT({ typ: TOTP_CHALLENGE_TYP })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secretKey(this.jwtSecret));
  }

  async verifyTotpChallenge(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, secretKey(this.jwtSecret));

    if (
      payload.typ !== TOTP_CHALLENGE_TYP ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0
    ) {
      throw new Error('Invalid authenticator challenge');
    }

    return { userId: payload.sub };
  }
}
