import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors.js';
import { createUnconfiguredS3AuthStrategy } from './s3-auth.strategy.js';
import { resolveS3Operation, S3_OPERATIONS } from './s3-operations.js';
import { escapeXml, renderS3Xml } from './s3-xml.js';

function request(overrides: {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): Request {
  const headers = overrides.headers ?? {};

  return {
    method: overrides.method,
    path: overrides.path,
    query: overrides.query ?? {},
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('resolveS3Operation', () => {
  it('maps service-level GET to ListBuckets', () => {
    expect(resolveS3Operation(request({ method: 'GET', path: '/' }))).toEqual({
      operation: 'ListBuckets',
    });
  });

  it('maps bucket-level operations', () => {
    expect(resolveS3Operation(request({ method: 'PUT', path: '/docs' }))).toEqual({
      operation: 'CreateBucket',
      bucket: 'docs',
    });
    expect(resolveS3Operation(request({ method: 'HEAD', path: '/docs' }))).toEqual({
      operation: 'HeadBucket',
      bucket: 'docs',
    });
    expect(resolveS3Operation(request({ method: 'DELETE', path: '/docs' }))).toEqual({
      operation: 'DeleteBucket',
      bucket: 'docs',
    });
  });

  it('distinguishes ListObjects from ListObjectsV2 by list-type', () => {
    expect(resolveS3Operation(request({ method: 'GET', path: '/docs' }))).toEqual({
      operation: 'ListObjects',
      bucket: 'docs',
    });
    expect(
      resolveS3Operation(request({ method: 'GET', path: '/docs', query: { 'list-type': '2' } })),
    ).toEqual({ operation: 'ListObjectsV2', bucket: 'docs' });
  });

  it('maps object-level operations and keeps slashes in the key', () => {
    expect(
      resolveS3Operation(request({ method: 'GET', path: '/docs/reports/2026/q1.pdf' })),
    ).toEqual({
      operation: 'GetObject',
      bucket: 'docs',
      key: 'reports/2026/q1.pdf',
    });

    expect(resolveS3Operation(request({ method: 'HEAD', path: '/docs/a.txt' }))).toMatchObject({
      operation: 'HeadObject',
      key: 'a.txt',
    });
    expect(resolveS3Operation(request({ method: 'DELETE', path: '/docs/a.txt' }))).toMatchObject({
      operation: 'DeleteObject',
    });
  });

  it('treats a PUT as CopyObject only when a copy-source header is present', () => {
    expect(resolveS3Operation(request({ method: 'PUT', path: '/docs/a.txt' }))).toMatchObject({
      operation: 'PutObject',
    });

    expect(
      resolveS3Operation(
        request({
          method: 'PUT',
          path: '/docs/a.txt',
          headers: { 'x-amz-copy-source': '/other/b.txt' },
        }),
      ),
    ).toMatchObject({ operation: 'CopyObject' });
  });

  it('maps the multipart lifecycle', () => {
    expect(
      resolveS3Operation(
        request({ method: 'POST', path: '/docs/big.bin', query: { uploads: '' } }),
      ),
    ).toMatchObject({ operation: 'CreateMultipartUpload' });

    expect(
      resolveS3Operation(
        request({
          method: 'PUT',
          path: '/docs/big.bin',
          query: { uploadId: 'u-1', partNumber: '3' },
        }),
      ),
    ).toEqual({
      operation: 'UploadPart',
      bucket: 'docs',
      key: 'big.bin',
      uploadId: 'u-1',
      partNumber: 3,
    });

    expect(
      resolveS3Operation(
        request({ method: 'POST', path: '/docs/big.bin', query: { uploadId: 'u-1' } }),
      ),
    ).toMatchObject({ operation: 'CompleteMultipartUpload', uploadId: 'u-1' });

    expect(
      resolveS3Operation(
        request({ method: 'DELETE', path: '/docs/big.bin', query: { uploadId: 'u-1' } }),
      ),
    ).toMatchObject({ operation: 'AbortMultipartUpload', uploadId: 'u-1' });
  });

  it('returns undefined for operations outside the supported subset', () => {
    // Unsupported verbs and service-level writes must not be guessed at.
    expect(resolveS3Operation(request({ method: 'PUT', path: '/' }))).toBeUndefined();
    expect(resolveS3Operation(request({ method: 'PATCH', path: '/docs/a.txt' }))).toBeUndefined();
    expect(resolveS3Operation(request({ method: 'POST', path: '/docs/a.txt' }))).toBeUndefined();
  });

  it('documents exactly the operations Phase 3 recognizes', () => {
    expect([...S3_OPERATIONS]).toEqual([
      'ListBuckets',
      'CreateBucket',
      'HeadBucket',
      'DeleteBucket',
      'PutObject',
      'GetObject',
      'HeadObject',
      'DeleteObject',
      'CopyObject',
      'ListObjects',
      'ListObjectsV2',
      'CreateMultipartUpload',
      'UploadPart',
      'CompleteMultipartUpload',
      'AbortMultipartUpload',
    ]);
  });
});

describe('renderS3Xml', () => {
  it('renders a namespaced document with a declaration', () => {
    const xml = renderS3Xml('Error', { Code: 'AccessDenied', Message: 'Denied' });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<Error xmlns="http://s3.amazonaws.com/doc/2006-03-01/">');
    expect(xml).toContain('<Code>AccessDenied</Code>');
  });

  it('omits null and undefined fields instead of emitting empty elements', () => {
    const xml = renderS3Xml('Error', { Code: 'X', BucketName: null, Resource: undefined });

    expect(xml).not.toContain('BucketName');
    expect(xml).not.toContain('Resource');
  });

  it('repeats the element name for arrays, as S3 does for Contents', () => {
    const xml = renderS3Xml('ListBucketResult', {
      Contents: [{ Key: 'a.txt' }, { Key: 'b.txt' }],
    });

    expect(xml).toContain('<Contents><Key>a.txt</Key></Contents>');
    expect(xml).toContain('<Contents><Key>b.txt</Key></Contents>');
  });

  it('escapes user-controlled keys so they cannot inject markup', () => {
    const xml = renderS3Xml('ListBucketResult', {
      Contents: [{ Key: '</Key></Contents><Evil>x</Evil>' }],
    });

    expect(xml).not.toContain('<Evil>');
    expect(xml).toContain('&lt;/Key&gt;');
  });

  it('escapes the five XML metacharacters', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });
});

describe('unconfigured S3 auth strategy', () => {
  it('refuses every request, so the gateway is inert until credentials exist', async () => {
    const strategy = createUnconfiguredS3AuthStrategy();

    await expect(strategy.authenticate(request({ method: 'GET', path: '/' }))).rejects.toThrow(
      AppError,
    );
  });

  it('reports STORAGE_ACCESS_DENIED rather than a server error', async () => {
    const strategy = createUnconfiguredS3AuthStrategy();

    await strategy.authenticate(request({ method: 'GET', path: '/' })).catch((error: unknown) => {
      expect((error as AppError).code).toBe('STORAGE_ACCESS_DENIED');
    });
  });
});
