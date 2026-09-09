import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { verifySigV4Request } from './sigv4.js';

function request(date: string, service = 's3'): Request {
  const dateStamp = date.slice(0, 8);
  const headers: Record<string, string> = {
    authorization: [
      `AWS4-HMAC-SHA256 Credential=access/${dateStamp}/vaultstack/${service}/aws4_request`,
      'SignedHeaders=host;x-amz-date',
      `Signature=${'a'.repeat(64)}`,
    ].join(','),
    host: 's3.example.test',
    'x-amz-date': date,
  };

  return {
    method: 'GET',
    originalUrl: '/bucket/object',
    header: (name: string): string | undefined => headers[name.toLowerCase()],
    get: (name: string): string | undefined => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('verifySigV4Request', () => {
  it('rejects replayed requests outside the clock-skew window', () => {
    const stale = new Date(Date.now() - 16 * 60 * 1000)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');

    expect(() => verifySigV4Request(request(stale), 'secret', 'vaultstack')).toThrow(
      'stale',
    );
  });

  it('rejects signatures scoped to a non-S3 service', () => {
    const fresh = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    expect(() => verifySigV4Request(request(fresh, 'ec2'), 'secret', 'vaultstack')).toThrow(
      'service mismatch',
    );
  });
});
