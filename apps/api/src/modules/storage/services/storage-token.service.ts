import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from '@vaultstack/auth';
import { storageAccessDenied, storageUploadExpired } from '../../../lib/errors.js';

/**
 * Short-lived HMAC tokens that let VaultStack issue presigned-style URLs for
 * providers with no signing endpoint of their own (the local filesystem).
 *
 * These tokens deliberately carry no storage credentials. They are scoped to a
 * single object or upload, expire, and are verified server-side on every use,
 * so a leaked URL grants nothing beyond that one object until it expires.
 */

export type StorageTokenPurpose = 'download' | 'upload';

export interface StorageTokenClaims {
  purpose: StorageTokenPurpose;
  organizationId: string;
  /** Object id for downloads, upload id for uploads. */
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

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export interface StorageTokenService {
  issue(
    claims: Omit<StorageTokenClaims, 'expiresAt'>,
    ttlSeconds: number,
  ): {
    token: string;
    expiresAt: Date;
  };
  verify(token: string, purpose: StorageTokenPurpose): StorageTokenClaims;
}

export function createStorageTokenService(secret: string): StorageTokenService {
  return {
    issue(claims, ttlSeconds) {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const encoded: EncodedClaims = {
        p: claims.purpose,
        g: claims.organizationId,
        s: claims.subjectId,
        e: Math.floor(expiresAt.getTime() / 1000),
        // A nonce keeps two tokens for the same object from being identical.
        n: randomBytes(8).toString('hex'),
      };

      const payload = base64UrlEncode(JSON.stringify(encoded));
      return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
    },

    verify(token, purpose) {
      const separator = token.lastIndexOf('.');
      if (separator <= 0) {
        throw storageAccessDenied('Malformed storage token');
      }

      const payload = token.slice(0, separator);
      const signature = token.slice(separator + 1);

      // Compared in constant time before the payload is trusted at all.
      if (!safeEqual(signature, sign(payload, secret))) {
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
    },
  };
}
