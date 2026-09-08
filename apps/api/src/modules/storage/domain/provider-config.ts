import type { Prisma } from '@vaultstack/database';
import {
  S3_DIALECTS,
  type S3DialectName,
  type StorageProviderCredentialSource,
} from '@vaultstack/types';

/**
 * Vendor-neutral view of StorageProvider.config.
 *
 * Services may read these fields. They must not branch on `dialect`; dialect
 * differences belong in S3 dialect adapters.
 */
export interface StorageProviderSettings {
  dialect: S3DialectName | null;
  endpoint: string | null;
  region: string | null;
  bucket: string | null;
  forcePathStyle: boolean | null;
  tls: boolean | null;
  accountId: string | null;
}

const DIALECT_VALUES = new Set<string>(Object.values(S3_DIALECTS));

export function readProviderConfig(
  config: Prisma.JsonValue | null | undefined,
): StorageProviderSettings {
  const record = asObject(config);

  return {
    dialect: readDialect(record.dialect),
    endpoint: readString(record.endpoint),
    region: readString(record.region),
    bucket: readString(record.bucket),
    forcePathStyle: readBoolean(record.forcePathStyle),
    tls: readBoolean(record.tls),
    accountId: readString(record.accountId),
  };
}

export function configuredPhysicalBucket(
  config: Prisma.JsonValue | null | undefined,
): string | undefined {
  return readProviderConfig(config).bucket ?? undefined;
}

export function toProviderConfigJson(settings: StorageProviderSettings): Prisma.InputJsonObject {
  const json: Record<string, string | boolean> = {};

  if (settings.dialect) {
    json.dialect = settings.dialect;
  }
  if (settings.endpoint) {
    json.endpoint = settings.endpoint;
  }
  if (settings.region) {
    json.region = settings.region;
  }
  if (settings.bucket) {
    json.bucket = settings.bucket;
  }
  if (settings.forcePathStyle !== null) {
    json.forcePathStyle = settings.forcePathStyle;
  }
  if (settings.tls !== null) {
    json.tls = settings.tls;
  }
  if (settings.accountId) {
    json.accountId = settings.accountId;
  }

  return json;
}

export function credentialsSourceOf(input: {
  credentialRef: string | null;
  secretCiphertext: string | null;
}): StorageProviderCredentialSource {
  if (input.secretCiphertext) {
    return 'stored';
  }

  if (input.credentialRef?.startsWith('env:')) {
    return 'env';
  }

  return 'none';
}

function asObject(config: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {};
  }

  return config;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readDialect(value: unknown): S3DialectName | null {
  return typeof value === 'string' && DIALECT_VALUES.has(value) ? (value as S3DialectName) : null;
}
