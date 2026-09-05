import { describe, expect, it } from 'vitest';
import { AppError } from '../../../lib/errors.js';
import {
  assertValidBucketName,
  assertValidKeyPrefix,
  assertValidObjectKey,
  commonPrefixOf,
} from './object-key.js';

const MAX_KEY_LENGTH = 1024;

function expectRejected(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }

  throw new Error('Expected the value to be rejected but it was accepted');
}

describe('assertValidBucketName', () => {
  it('accepts S3-compatible names', () => {
    for (const name of ['docs', 'my-bucket', 'a1-b2-c3', 'a'.repeat(63)]) {
      expect(assertValidBucketName(name)).toBe(name);
    }
  });

  it('rejects names outside the 3-63 character range', () => {
    expectRejected(() => assertValidBucketName('ab'), 'STORAGE_INVALID_BUCKET_NAME');
    expectRejected(() => assertValidBucketName('a'.repeat(64)), 'STORAGE_INVALID_BUCKET_NAME');
  });

  it('rejects uppercase, underscores, dots and spaces', () => {
    for (const name of ['MyBucket', 'my_bucket', 'my.bucket', 'my bucket']) {
      expectRejected(() => assertValidBucketName(name), 'STORAGE_INVALID_BUCKET_NAME');
    }
  });

  it('rejects names that do not start and end alphanumerically', () => {
    for (const name of ['-bucket', 'bucket-']) {
      expectRejected(() => assertValidBucketName(name), 'STORAGE_INVALID_BUCKET_NAME');
    }
  });

  it('rejects IP-address shapes and reserved prefixes and suffixes', () => {
    for (const name of ['192.168.0.1', 'xn--bucket', 'sthree-bucket', 'bucket-s3alias']) {
      expectRejected(() => assertValidBucketName(name), 'STORAGE_INVALID_BUCKET_NAME');
    }
  });

  it('rejects traversal and null bytes', () => {
    for (const name of ['../etc', 'a/../b', 'bucket\0']) {
      expectRejected(() => assertValidBucketName(name), 'STORAGE_INVALID_BUCKET_NAME');
    }
  });
});

describe('assertValidObjectKey', () => {
  it('accepts ordinary and folder-shaped keys', () => {
    for (const key of ['report.pdf', 'documents/2026/report.pdf', 'a b c.txt', 'ünïcode.txt']) {
      expect(assertValidObjectKey(key, MAX_KEY_LENGTH)).toBe(key);
    }
  });

  it('rejects empty and oversized keys', () => {
    expectRejected(() => assertValidObjectKey('', MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    expectRejected(
      () => assertValidObjectKey('a'.repeat(MAX_KEY_LENGTH + 1), MAX_KEY_LENGTH),
      'STORAGE_INVALID_KEY',
    );
  });

  it('measures the length limit in bytes, not characters', () => {
    // Each of these is 1 character but 4 UTF-8 bytes.
    expectRejected(() => assertValidObjectKey('😀'.repeat(3), 8), 'STORAGE_INVALID_KEY');
  });

  it('rejects traversal sequences', () => {
    for (const key of ['../secret', 'a/../../secret', 'a/./b', '..', 'a/..']) {
      expectRejected(() => assertValidObjectKey(key, MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    }
  });

  it('rejects absolute paths and Windows paths', () => {
    for (const key of ['/etc/passwd', 'C:\\Windows\\system32', 'c:/windows', '\\\\server\\share']) {
      expectRejected(() => assertValidObjectKey(key, MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    }
  });

  it('rejects null bytes and control characters', () => {
    for (const key of ['file\0.txt', 'file\n.txt', 'file\r\n.txt', 'file\u007f.txt']) {
      expectRejected(() => assertValidObjectKey(key, MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    }
  });

  it('rejects empty segments and trailing slashes', () => {
    for (const key of ['a//b', 'folder/']) {
      expectRejected(() => assertValidObjectKey(key, MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    }
  });
});

describe('assertValidKeyPrefix', () => {
  it('accepts partial segments, which is the point of a prefix', () => {
    for (const prefix of ['', 'doc', 'documents/', 'documents/rep']) {
      expect(assertValidKeyPrefix(prefix, MAX_KEY_LENGTH)).toBe(prefix);
    }
  });

  it('rejects traversal, absolute paths and null bytes', () => {
    for (const prefix of ['../', 'a/../b', '/etc', 'a\\b', 'a\0']) {
      expectRejected(() => assertValidKeyPrefix(prefix, MAX_KEY_LENGTH), 'STORAGE_INVALID_KEY');
    }
  });
});

describe('commonPrefixOf', () => {
  it('collapses keys to their first folder below the prefix', () => {
    expect(commonPrefixOf('documents/2026/a.pdf', 'documents/', '/')).toBe('documents/2026/');
  });

  it('returns null for keys with no further delimiter', () => {
    expect(commonPrefixOf('documents/a.pdf', 'documents/', '/')).toBeNull();
  });

  it('returns null when there is no delimiter or the prefix does not match', () => {
    expect(commonPrefixOf('documents/a.pdf', 'documents/', '')).toBeNull();
    expect(commonPrefixOf('other/a.pdf', 'documents/', '/')).toBeNull();
  });
});
