import type { Request } from 'express';
import { storageAccessDenied } from '../../lib/errors.js';

/**
 * Identity resolved from an S3 protocol request.
 *
 * Deliberately narrow: the gateway only needs to know which organization the
 * caller acts on and which principal to attribute audit entries to. Browser
 * sessions are never accepted here, keeping S3 API authentication separate
 * from VaultStack's cookie/CSRF flow.
 */
export interface S3Principal {
  organizationId: string;
  /** User or service-account id used for authorization and audit records. */
  principalId: string;
  accessKeyId: string;
}

/**
 * Pluggable authentication for the S3 gateway.
 *
 * SigV4 verification needs a retrievable secret per access key. Phase 2 stores
 * API keys as one-way hashes, so a signing-capable credential store is a
 * separate concern (Phase 14 service accounts). This interface is the seam
 * that lets that arrive without touching gateway routing.
 */
export interface S3AuthStrategy {
  readonly name: string;
  authenticate(req: Request): Promise<S3Principal>;
}

/**
 * Default strategy: refuses every request.
 *
 * The gateway is therefore inert until a signing-capable credential store is
 * registered, which is safer than shipping a placeholder that authenticates.
 */
export function createUnconfiguredS3AuthStrategy(): S3AuthStrategy {
  return {
    name: 'unconfigured',
    authenticate(): Promise<S3Principal> {
      return Promise.reject(
        storageAccessDenied(
          'S3 gateway credentials are not configured. S3 access keys arrive with service accounts.',
        ),
      );
    },
  };
}
