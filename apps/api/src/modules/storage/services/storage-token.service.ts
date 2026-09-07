import { createHmac, randomBytes } from 'node:crypto';
import { CryptoUtil } from '@vaultstack/auth';
import { storageAccessDenied, storageUploadExpired } from '../../../lib/errors.js';

/**
 * Short-lived HMAC tokens that let VaultStack issue presigned-style URLs for
 * providers with no signing endpoint of their own (the local filesystem).
 */

export type StorageTokenPurpose = 'download' | 'upload';

export interface StorageTokenClaims {
  purpose: StorageTokenPurpose;
  organizationId: string;
  subjectId: string;
  expiresAt: Date;
}

interface EncodedClaims {
  p: StorageTokenPurpose;
  g: string;
  s: string;
  e: number;
  n: string;
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

export class StorageTokenManager {
  constructor(private readonly secret: string) {}

  issue(
    claims: Omit<StorageTokenClaims, 'expiresAt'>,
    ttlSeconds: number,
  ): { token: string; expiresAt: Date } {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const encoded: EncodedClaims = {
      p: claims.purpose,
      g: claims.organizationId,
      s: claims.subjectId,
      e: Math.floor(expiresAt.getTime() / 1000),
      n: randomBytes(8).toString('hex'),
    };

    const payload = base64UrlEncode(JSON.stringify(encoded));
    return { token: `${payload}.${this.sign(payload)}`, expiresAt };
  }

  verify(token: string, purpose: StorageTokenPurpose): StorageTokenClaims {
    const separator = token.lastIndexOf('.');
    if (separator <= 0) {
      throw storageAccessDenied('Malformed storage token');
    }

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);

    if (!CryptoUtil.timingSafeEqual(signature, this.sign(payload))) {
      throw storageAccessDenied('Invalid storage token');
    }

    let claims: EncodedClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as EncodedClaims;
    } catch {
      throw storageAccessDenied('Malformed storage token');
    }

    if (claims.p !== purpose) {
      throw storageAccessDenied('Storage token was issued for a different operation');
    }

    const expiresAt = new Date(claims.e * 1000);
    if (expiresAt.getTime() <= Date.now()) {
      throw storageUploadExpired();
    }

    return {
      purpose: claims.p,
      organizationId: claims.g,
      subjectId: claims.s,
      expiresAt,
    };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}

export type StorageTokenService = StorageTokenManager;

export function createStorageTokenService(secret: string): StorageTokenManager {
  return new StorageTokenManager(secret);
}
