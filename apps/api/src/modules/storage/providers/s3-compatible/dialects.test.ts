import { describe, expect, it } from 'vitest';
import { S3_DIALECTS } from '@vaultstack/types';
import { getS3Dialect, resolveDialectEndpoint } from './dialects.js';

describe('S3 dialect adapters', () => {
  it('does not require an endpoint for AWS S3', () => {
    const dialect = getS3Dialect(S3_DIALECTS.AWS_S3);
    expect(resolveDialectEndpoint(dialect, {})).toBeUndefined();
    expect(dialect.sendCreateBucketLocationConstraint).toBe(true);
    expect(dialect.defaultForcePathStyle).toBe(false);
    expect(dialect.endpointPolicy.allowHttp).toBe(false);
  });

  it('builds the Cloudflare R2 endpoint from an account id', () => {
    const dialect = getS3Dialect(S3_DIALECTS.CLOUDFLARE_R2);
    expect(resolveDialectEndpoint(dialect, { accountId: 'abc123' })).toBe(
      'https://abc123.r2.cloudflarestorage.com',
    );
    expect(dialect.sendCreateBucketLocationConstraint).toBe(false);
  });

  it('requires an account id or endpoint for R2', () => {
    const dialect = getS3Dialect(S3_DIALECTS.CLOUDFLARE_R2);
    expect(() => resolveDialectEndpoint(dialect, {})).toThrow(/account id or endpoint/);
  });

  it('builds Backblaze, Wasabi, and Spaces endpoints from region', () => {
    expect(
      resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.BACKBLAZE_B2), { region: 'eu-central-003' }),
    ).toBe('https://s3.eu-central-003.backblazeb2.com');
    expect(
      resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.WASABI), { region: 'eu-central-1' }),
    ).toBe('https://s3.eu-central-1.wasabisys.com');
    expect(
      resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.DIGITALOCEAN_SPACES), { region: 'sfo3' }),
    ).toBe('https://sfo3.digitaloceanspaces.com');
  });

  it('requires an explicit endpoint for MinIO and generic dialects', () => {
    expect(() => resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.MINIO), {})).toThrow(/endpoint/);
    expect(() => resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.GENERIC), {})).toThrow(/endpoint/);

    expect(
      resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.MINIO), {
        endpoint: '127.0.0.1:9000',
        tls: false,
      }),
    ).toBe('http://127.0.0.1:9000');
  });

  it('lets a custom endpoint override vendor defaults', () => {
    expect(
      resolveDialectEndpoint(getS3Dialect(S3_DIALECTS.WASABI), {
        endpoint: 'https://s3.custom.example',
      }),
    ).toBe('https://s3.custom.example');
  });
});
