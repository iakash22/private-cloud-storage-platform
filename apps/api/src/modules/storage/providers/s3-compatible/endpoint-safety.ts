import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { validationError } from '../../../../lib/errors.js';

/**
 * SSRF policy applied to a resolved S3 endpoint. Dialects that are expected to
 * run on a private network (MinIO) can loosen these; generic/public vendors
 * stay on HTTPS and public addresses only.
 */
export interface EndpointSafetyPolicy {
  allowHttp: boolean;
  allowLoopback: boolean;
  allowPrivateNetworks: boolean;
  allowLinkLocal: boolean;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.google.internal.',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc',
  'kubernetes.default.svc.cluster.local',
]);

const PUBLIC_HTTPS_POLICY: EndpointSafetyPolicy = {
  allowHttp: false,
  allowLoopback: false,
  allowPrivateNetworks: false,
  allowLinkLocal: false,
};

const SELF_HOSTED_POLICY: EndpointSafetyPolicy = {
  allowHttp: true,
  allowLoopback: true,
  allowPrivateNetworks: true,
  allowLinkLocal: false,
};

export const PUBLIC_S3_ENDPOINT_POLICY = PUBLIC_HTTPS_POLICY;
export const SELF_HOSTED_S3_ENDPOINT_POLICY = SELF_HOSTED_POLICY;

export function restrictPrivateEndpointPolicy(
  policy: EndpointSafetyPolicy,
): EndpointSafetyPolicy {
  return {
    ...policy,
    allowLoopback: false,
    allowPrivateNetworks: false,
    allowLinkLocal: false,
  };
}

export async function defaultAddressLookup(hostname: string): Promise<ResolvedAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

/**
 * Validates that an S3 endpoint cannot be used as an SSRF trampoline.
 *
 * Protocols other than HTTP(S), embedded credentials, and (by default)
 * loopback / RFC1918 / link-local / metadata addresses are rejected. DNS is
 * resolved and every returned address is checked so a public hostname that
 * rebinds to 169.254.169.254 is also refused.
 */
export async function assertSafeS3Endpoint(
  raw: string,
  policy: EndpointSafetyPolicy,
  lookup: AddressLookup = defaultAddressLookup,
): Promise<URL> {
  const parsed = parseEndpointUrl(raw);

  if (parsed.username || parsed.password) {
    throw validationError('Storage endpoint must not include credentials');
  }

  if (parsed.protocol === 'http:') {
    if (!policy.allowHttp) {
      throw validationError('Storage endpoint must use HTTPS');
    }
  } else if (parsed.protocol !== 'https:') {
    throw validationError('Storage endpoint must use HTTP or HTTPS');
  }

  const hostname = parsed.hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!hostname) {
    throw validationError('Storage endpoint host is required');
  }

  if (isBlockedHostname(hostname, policy)) {
    throw validationError('Storage endpoint host is not allowed');
  }

  const literalFamily = isIP(stripIpv6Brackets(hostname));
  if (literalFamily === 4 || literalFamily === 6) {
    assertAddressAllowed(stripIpv6Brackets(hostname), literalFamily, policy);
    return parsed;
  }

  if (/^\d+$/.test(hostname) || isUnusualIpv4Form(hostname)) {
    throw validationError('Storage endpoint host is not allowed');
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch {
    throw validationError('Storage endpoint host could not be resolved');
  }

  if (addresses.length === 0) {
    throw validationError('Storage endpoint host could not be resolved');
  }

  for (const record of addresses) {
    assertAddressAllowed(record.address, record.family, policy);
  }

  return parsed;
}

export function parseEndpointUrl(raw: string, tls = true): URL {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw validationError('Storage endpoint is required');
  }

  const withScheme = trimmed.includes('://') ? trimmed : `${tls ? 'https' : 'http'}://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw validationError('Storage endpoint is not a valid URL');
  }

  return parsed;
}

function isBlockedHostname(hostname: string, policy: EndpointSafetyPolicy): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return !(policy.allowLoopback && hostname.startsWith('localhost'));
  }

  if (hostname.endsWith('.localhost')) {
    return !policy.allowLoopback;
  }

  if (
    !policy.allowPrivateNetworks &&
    (hostname.endsWith('.internal') || hostname.endsWith('.local'))
  ) {
    return true;
  }

  return false;
}

function assertAddressAllowed(address: string, family: 4 | 6, policy: EndpointSafetyPolicy): void {
  if (family === 4) {
    assertIpv4Allowed(address, policy);
    return;
  }

  assertIpv6Allowed(address, policy);
}

function assertIpv4Allowed(address: string, policy: EndpointSafetyPolicy): void {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw validationError('Storage endpoint host is not allowed');
  }

  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;

  const loopback = a === 127;
  const unspecified = a === 0;
  const linkLocal = a === 169 && b === 254;
  const private10 = a === 10;
  const private172 = a === 172 && b >= 16 && b <= 31;
  const private192 = a === 192 && b === 168;
  const cgnat = a === 100 && b >= 64 && b <= 127;
  const multicast = a >= 224;

  if (unspecified || multicast) {
    throw validationError('Storage endpoint host is not allowed');
  }

  if (loopback && !policy.allowLoopback) {
    throw validationError('Storage endpoint must not target a loopback address');
  }

  if (linkLocal && !policy.allowLinkLocal) {
    throw validationError('Storage endpoint must not target a link-local address');
  }

  if ((private10 || private172 || private192 || cgnat) && !policy.allowPrivateNetworks) {
    throw validationError('Storage endpoint must not target a private network');
  }
}

function assertIpv6Allowed(address: string, policy: EndpointSafetyPolicy): void {
  const normalized = address.toLowerCase();

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) {
      assertIpv4Allowed(mapped, policy);
      return;
    }
  }

  const loopback = normalized === '::1';
  const unspecified = normalized === '::';
  const linkLocal = normalized.startsWith('fe80:');
  const uniqueLocal = normalized.startsWith('fc') || normalized.startsWith('fd');

  if (unspecified) {
    throw validationError('Storage endpoint host is not allowed');
  }

  if (loopback && !policy.allowLoopback) {
    throw validationError('Storage endpoint must not target a loopback address');
  }

  if (linkLocal && !policy.allowLinkLocal) {
    throw validationError('Storage endpoint must not target a link-local address');
  }

  if (uniqueLocal && !policy.allowPrivateNetworks) {
    throw validationError('Storage endpoint must not target a private network');
  }
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isUnusualIpv4Form(hostname: string): boolean {
  return /^(0x[0-9a-f]+|\d+\.\d+|\d+\.\d+\.\d+)$/i.test(hostname);
}
