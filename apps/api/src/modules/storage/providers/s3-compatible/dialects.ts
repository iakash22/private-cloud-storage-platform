import { S3_DIALECTS, type S3DialectName } from '@vaultstack/types';
import { validationError } from '../../../../lib/errors.js';
import {
  parseEndpointUrl,
  PUBLIC_S3_ENDPOINT_POLICY,
  SELF_HOSTED_S3_ENDPOINT_POLICY,
  type EndpointSafetyPolicy,
} from './endpoint-safety.js';

export interface DialectEndpointInput {
  endpoint?: string | null;
  region?: string | null;
  tls?: boolean | null;
  accountId?: string | null;
}

/**
 * Vendor-specific S3 connection defaults.
 *
 * This is the only module allowed to branch on dialect names. Callers receive
 * resolved connection options; they never write `if (dialect === 'AWS_S3')`.
 */
export interface S3DialectAdapter {
  readonly name: S3DialectName;
  readonly defaultRegion: string;
  readonly defaultForcePathStyle: boolean;
  readonly defaultTls: boolean;
  readonly sendCreateBucketLocationConstraint: boolean;
  readonly requiresEndpoint: boolean;
  readonly endpointPolicy: EndpointSafetyPolicy;
  resolveEndpoint(input: DialectEndpointInput): string | undefined;
  assertConfigured(input: DialectEndpointInput): void;
}

const AWS_S3: S3DialectAdapter = {
  name: S3_DIALECTS.AWS_S3,
  defaultRegion: 'us-east-1',
  defaultForcePathStyle: false,
  defaultTls: true,
  sendCreateBucketLocationConstraint: true,
  requiresEndpoint: false,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    return optionalEndpoint(input);
  },
  assertConfigured() {
    // AWS S3 can use the SDK default endpoint.
  },
};

const CLOUDFLARE_R2: S3DialectAdapter = {
  name: S3_DIALECTS.CLOUDFLARE_R2,
  defaultRegion: 'auto',
  defaultForcePathStyle: true,
  defaultTls: true,
  // R2's region is `auto`; a LocationConstraint of that value is rejected.
  sendCreateBucketLocationConstraint: false,
  requiresEndpoint: false,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    const explicit = optionalEndpoint(input);
    if (explicit) {
      return explicit;
    }

    const accountId = input.accountId?.trim();
    if (!accountId) {
      return undefined;
    }

    return `https://${accountId}.r2.cloudflarestorage.com`;
  },
  assertConfigured(input) {
    if (!optionalEndpoint(input) && !input.accountId?.trim()) {
      throw validationError('Cloudflare R2 requires an account id or endpoint', {
        accountId: 'Cloudflare R2 requires an account id or endpoint',
        endpoint: 'Cloudflare R2 requires an account id or endpoint',
      });
    }
  },
};

const BACKBLAZE_B2: S3DialectAdapter = {
  name: S3_DIALECTS.BACKBLAZE_B2,
  defaultRegion: 'us-west-004',
  defaultForcePathStyle: true,
  defaultTls: true,
  sendCreateBucketLocationConstraint: false,
  requiresEndpoint: false,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    const explicit = optionalEndpoint(input);
    if (explicit) {
      return explicit;
    }

    const region = nonempty(input.region) ?? 'us-west-004';
    return `https://s3.${region}.backblazeb2.com`;
  },
  assertConfigured() {
    // Region is enough to build the public B2 S3 endpoint.
  },
};

const MINIO: S3DialectAdapter = {
  name: S3_DIALECTS.MINIO,
  defaultRegion: 'us-east-1',
  defaultForcePathStyle: true,
  defaultTls: false,
  sendCreateBucketLocationConstraint: true,
  requiresEndpoint: true,
  endpointPolicy: SELF_HOSTED_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    return optionalEndpoint(input);
  },
  assertConfigured(input) {
    requireEndpoint(this, input);
  },
};

const WASABI: S3DialectAdapter = {
  name: S3_DIALECTS.WASABI,
  defaultRegion: 'us-east-1',
  defaultForcePathStyle: false,
  defaultTls: true,
  sendCreateBucketLocationConstraint: false,
  requiresEndpoint: false,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    const explicit = optionalEndpoint(input);
    if (explicit) {
      return explicit;
    }

    const region = nonempty(input.region) ?? 'us-east-1';
    return `https://s3.${region}.wasabisys.com`;
  },
  assertConfigured() {
    // Region is enough to build the public Wasabi endpoint.
  },
};

const DIGITALOCEAN_SPACES: S3DialectAdapter = {
  name: S3_DIALECTS.DIGITALOCEAN_SPACES,
  defaultRegion: 'nyc3',
  defaultForcePathStyle: false,
  defaultTls: true,
  sendCreateBucketLocationConstraint: false,
  requiresEndpoint: false,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    const explicit = optionalEndpoint(input);
    if (explicit) {
      return explicit;
    }

    const region = nonempty(input.region) ?? 'nyc3';
    return `https://${region}.digitaloceanspaces.com`;
  },
  assertConfigured() {
    // Region is enough to build the public Spaces endpoint.
  },
};

const GENERIC: S3DialectAdapter = {
  name: S3_DIALECTS.GENERIC,
  defaultRegion: 'us-east-1',
  defaultForcePathStyle: true,
  defaultTls: true,
  sendCreateBucketLocationConstraint: true,
  requiresEndpoint: true,
  endpointPolicy: PUBLIC_S3_ENDPOINT_POLICY,
  resolveEndpoint(input) {
    return optionalEndpoint(input);
  },
  assertConfigured(input) {
    requireEndpoint(this, input);
  },
};

const DIALECTS: Record<S3DialectName, S3DialectAdapter> = {
  AWS_S3,
  CLOUDFLARE_R2,
  BACKBLAZE_B2,
  MINIO,
  WASABI,
  DIGITALOCEAN_SPACES,
  GENERIC,
};

export function getS3Dialect(name: string): S3DialectAdapter {
  if (!isS3DialectName(name)) {
    throw validationError(`Unsupported S3 dialect: ${name}`, {
      dialect: `Unsupported S3 dialect: ${name}`,
    });
  }

  return DIALECTS[name];
}

export function isS3DialectName(value: string): value is S3DialectName {
  return value in DIALECTS;
}

/**
 * Resolves the endpoint a dialect will actually use. Missing-endpoint rules
 * live on the adapter so callers never switch on vendor names.
 */
export function resolveDialectEndpoint(
  dialect: S3DialectAdapter,
  input: DialectEndpointInput,
): string | undefined {
  dialect.assertConfigured(input);
  return dialect.resolveEndpoint(input);
}

function requireEndpoint(dialect: S3DialectAdapter, input: DialectEndpointInput): void {
  if (!optionalEndpoint(input)) {
    throw validationError(`${dialect.name} requires an endpoint`, {
      endpoint: `${dialect.name} requires an endpoint`,
    });
  }
}

function optionalEndpoint(input: DialectEndpointInput): string | undefined {
  const raw = nonempty(input.endpoint);
  if (!raw) {
    return undefined;
  }

  const tls = input.tls ?? true;
  return parseEndpointUrl(raw, tls).toString().replace(/\/$/, '');
}

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') {
    return undefined;
  }

  return trimmed;
}
