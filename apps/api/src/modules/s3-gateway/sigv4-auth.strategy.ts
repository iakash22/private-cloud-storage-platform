import type { Request } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import { unauthorized } from '../../lib/errors.js';
import type { S3CredentialService } from './services/s3-credential.service.js';
import { verifySigV4Request } from './sigv4.js';
import { assertCredentialActive } from './s3-authorization.js';
import type { S3AuthStrategy, S3Principal } from './s3-auth.strategy.js';

export function createSigV4S3AuthStrategy(
  credentials: S3CredentialService,
  config: EnvConfig,
): S3AuthStrategy {
  return {
    name: 'sigv4',
    async authenticate(req: Request): Promise<S3Principal> {
      const authorization = req.header('authorization');
      if (!authorization) {
        throw unauthorized('Missing S3 authorization header');
      }

      const accessKeyMatch = /Credential=([^/]+)/.exec(authorization);
      const accessKeyId = accessKeyMatch?.[1];
      if (!accessKeyId) {
        throw unauthorized('Missing S3 access key id');
      }

      const resolved = await credentials.resolveByAccessKeyId(accessKeyId);
      if (!resolved) {
        throw unauthorized('Invalid S3 access key id');
      }

      assertCredentialActive({
        revokedAt: resolved.credential.revokedAt,
        expiresAt: resolved.credential.expiresAt,
        serviceAccountDisabledAt: resolved.credential.serviceAccount.disabledAt,
      });

      verifySigV4Request(req, resolved.secretAccessKey, config.S3_GATEWAY_REGION);

      await credentials.markUsed(resolved.credential.id);

      return {
        organizationId: resolved.credential.organizationId,
        principalId: resolved.credential.serviceAccountId,
        credentialId: resolved.credential.id,
        accessKeyId: resolved.credential.accessKeyId,
        permissions: resolved.credential.permissions,
        allowedBucketNames: resolved.credential.allowedBucketNames,
      };
    },
  };
}
