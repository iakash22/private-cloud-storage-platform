import { describe, expect, it } from 'vitest';
import { AppError } from '../../../../lib/errors.js';
import {
  PUBLIC_S3_ENDPOINT_POLICY,
  SELF_HOSTED_S3_ENDPOINT_POLICY,
  assertSafeS3Endpoint,
  type AddressLookup,
} from './endpoint-safety.js';

function lookupOf(addresses: Record<string, { address: string; family: 4 | 6 }[]>): AddressLookup {
  return async (hostname) => {
    const records = addresses[hostname];
    if (!records) {
      throw new Error('ENOTFOUND');
    }
    return records;
  };
}

async function expectRejected(raw: string, policy = PUBLIC_S3_ENDPOINT_POLICY): Promise<void> {
  await expect(assertSafeS3Endpoint(raw, policy, lookupOf({}))).rejects.toBeInstanceOf(AppError);
}

describe('assertSafeS3Endpoint', () => {
  it('accepts HTTPS public addresses', async () => {
    const url = await assertSafeS3Endpoint(
      'https://s3.wasabisys.com',
      PUBLIC_S3_ENDPOINT_POLICY,
      lookupOf({ 's3.wasabisys.com': [{ address: '8.8.8.8', family: 4 }] }),
    );

    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('s3.wasabisys.com');
  });

  it('rejects HTTP for public dialects', async () => {
    await expectRejected('http://s3.wasabisys.com');
  });

  it('rejects file and other protocols', async () => {
    await expectRejected('file:///etc/passwd');
    await expectRejected('ftp://s3.example.com');
    await expectRejected('javascript:alert(1)');
  });

  it('rejects credentials in the URL', async () => {
    await expectRejected('https://user:secret@s3.wasabisys.com');
  });

  it('rejects loopback and metadata addresses for public dialects', async () => {
    await expectRejected('https://127.0.0.1');
    await expectRejected('https://169.254.169.254');
    await expectRejected('https://[::1]');
    await expectRejected('https://10.0.0.5');
    await expectRejected('https://192.168.1.10');
    await expectRejected('https://172.16.0.8');
  });

  it('rejects public hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeS3Endpoint(
        'https://evil.example',
        PUBLIC_S3_ENDPOINT_POLICY,
        lookupOf({ 'evil.example': [{ address: '169.254.169.254', family: 4 }] }),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('allows HTTP loopback for self-hosted dialects', async () => {
    const url = await assertSafeS3Endpoint(
      'http://127.0.0.1:9000',
      SELF_HOSTED_S3_ENDPOINT_POLICY,
      lookupOf({}),
    );

    expect(url.hostname).toBe('127.0.0.1');
    expect(url.port).toBe('9000');
  });

  it('still rejects link-local metadata for self-hosted dialects', async () => {
    await expect(
      assertSafeS3Endpoint('http://169.254.169.254', SELF_HOSTED_S3_ENDPOINT_POLICY, lookupOf({})),
    ).rejects.toBeInstanceOf(AppError);
  });
});
