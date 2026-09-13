import { storageInvalidBucketName, storageInvalidKey } from '../../../lib/errors.js';

const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Prefixes AWS reserves, rejected so buckets stay portable across providers. */
const RESERVED_BUCKET_PREFIXES = ['xn--', 'sthree-', 'amzn-s3-demo-'];
const RESERVED_BUCKET_SUFFIXES = ['-s3alias', '--ol-s3'];

/**
 * Validates a bucket name against the S3 naming rules.
 *
 * Dots are rejected on purpose: they are legal in S3 but break virtual-host
 * style TLS certificates, and allowing them would make bucket names ambiguous
 * with hostnames.
 */
export function assertValidBucketName(name: string): string {
  if (name.length < 3 || name.length > 63) {
    throw storageInvalidBucketName('Bucket name must be between 3 and 63 characters');
  }

  if (!BUCKET_NAME_PATTERN.test(name)) {
    throw storageInvalidBucketName(
      'Bucket name may contain only lowercase letters, digits and hyphens, and must start and end with a letter or digit',
    );
  }

  if (IPV4_PATTERN.test(name)) {
    throw storageInvalidBucketName('Bucket name must not look like an IP address');
  }

  if (RESERVED_BUCKET_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    throw storageInvalidBucketName('Bucket name uses a reserved prefix');
  }

  if (RESERVED_BUCKET_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    throw storageInvalidBucketName('Bucket name uses a reserved suffix');
  }

  return name;
}

/**
 * Validates a user-supplied object key.
 *
 * Keys are stored as metadata and never used to construct a filesystem path,
 * but they are still validated so that traversal-shaped and control-character
 * keys cannot reach downstream providers, logs, or headers.
 */
export function assertValidObjectKey(key: string, maxLength: number): string {
  if (key.length === 0) {
    throw storageInvalidKey('Object key must not be empty');
  }

  if (Buffer.byteLength(key, 'utf8') > maxLength) {
    throw storageInvalidKey(`Object key must be at most ${maxLength} bytes`);
  }

  if (key.includes('\0')) {
    throw storageInvalidKey('Object key must not contain null bytes');
  }

  // Control characters break HTTP headers and XML responses.
  for (const character of key) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      throw storageInvalidKey('Object key must not contain control characters');
    }
  }

  if (key.startsWith('/')) {
    throw storageInvalidKey('Object key must not be an absolute path');
  }

  if (key.includes('\\')) {
    throw storageInvalidKey('Object key must not contain backslashes');
  }

  // Rejects C:\..., C:/... and \\server\share style Windows paths.
  if (/^[a-zA-Z]:/.test(key)) {
    throw storageInvalidKey('Object key must not contain a drive letter');
  }

  if (key.includes('//')) {
    throw storageInvalidKey('Object key must not contain empty path segments');
  }

  if (key.endsWith('/')) {
    throw storageInvalidKey('Object key must not end with a slash');
  }

  const segments = key.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw storageInvalidKey('Object key must not contain relative path segments');
  }

  return key;
}

/** Validates one user-visible folder name without allowing nested segments. */
export function assertValidFolderName(name: string, maxLength: number): string {
  const normalized = name.trim();
  if (!normalized) {
    throw storageInvalidKey('Folder name must not be empty');
  }
  if (Buffer.byteLength(normalized, 'utf8') > maxLength) {
    throw storageInvalidKey(`Folder name must be at most ${maxLength} bytes`);
  }
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw storageInvalidKey('Folder name must be a single safe path segment');
  }
  for (const character of normalized) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      throw storageInvalidKey('Folder name must not contain control characters');
    }
  }
  return normalized;
}

/** Builds and validates the canonical zero-byte marker key for a folder. */
export function buildFolderMarkerKey(
  parentPrefix: string,
  name: string,
  maxLength: number,
): string {
  const normalizedPrefix =
    parentPrefix.length > 0 && !parentPrefix.endsWith('/') ? `${parentPrefix}/` : parentPrefix;
  const prefix = assertValidKeyPrefix(normalizedPrefix, maxLength);
  const folderName = assertValidFolderName(name, maxLength);
  return assertValidFolderMarkerKey(`${prefix}${folderName}/`, maxLength);
}

export function assertValidFolderMarkerKey(key: string, maxLength: number): string {
  if (!key.endsWith('/')) {
    throw storageInvalidKey('Folder marker key must end with a slash');
  }
  const objectKey = key.slice(0, -1);
  assertValidObjectKey(objectKey, maxLength);
  return key;
}

/**
 * Validates a listing prefix. Prefixes are looser than keys because a prefix
 * legitimately ends mid-segment, but traversal shapes are still rejected.
 */
export function assertValidKeyPrefix(prefix: string, maxLength: number): string {
  if (Buffer.byteLength(prefix, 'utf8') > maxLength) {
    throw storageInvalidKey(`Prefix must be at most ${maxLength} bytes`);
  }

  if (prefix.includes('\0')) {
    throw storageInvalidKey('Prefix must not contain null bytes');
  }

  if (prefix.startsWith('/') || prefix.includes('\\') || prefix.includes('..')) {
    throw storageInvalidKey('Prefix must not contain traversal sequences');
  }

  return prefix;
}

/**
 * Splits a key into the "folder" prefixes a listing should collapse to,
 * mirroring the S3 CommonPrefixes behaviour.
 */
export function commonPrefixOf(key: string, prefix: string, delimiter: string): string | null {
  if (!delimiter || !key.startsWith(prefix)) {
    return null;
  }

  const remainder = key.slice(prefix.length);
  const index = remainder.indexOf(delimiter);
  if (index === -1) {
    return null;
  }

  return `${prefix}${remainder.slice(0, index + delimiter.length)}`;
}
