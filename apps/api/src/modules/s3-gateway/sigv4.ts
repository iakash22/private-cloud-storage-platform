import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { unauthorized } from '../../lib/errors.js';

export interface ParsedSigV4Authorization {
  accessKeyId: string;
  dateStamp: string;
  region: string;
  service: string;
  signedHeaders: string[];
  signature: string;
}

export function parseSigV4Authorization(header: string | undefined): ParsedSigV4Authorization {
  if (!header?.startsWith('AWS4-HMAC-SHA256 ')) {
    throw unauthorized('Invalid S3 authorization header');
  }

  const parts = Object.fromEntries(
    header
      .slice('AWS4-HMAC-SHA256 '.length)
      .split(',')
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
      }),
  );

  const credential = parts.Credential;
  const signedHeaders = parts.SignedHeaders?.split(';').filter(Boolean);
  const signature = parts.Signature;

  if (!credential || !signedHeaders || !signature) {
    throw unauthorized('Malformed S3 authorization header');
  }
  if (
    signedHeaders.some((name) => name !== name.toLowerCase() || !/^[a-z0-9-]+$/.test(name)) ||
    !signedHeaders.includes('host') ||
    new Set(signedHeaders).size !== signedHeaders.length ||
    signedHeaders.some((name, index) => {
      const previous = signedHeaders[index - 1];
      return previous !== undefined && previous > name;
    })
  ) {
    throw unauthorized('Malformed S3 signed headers');
  }

  const [accessKeyId, dateStamp, region, service] = credential.split('/');
  if (!accessKeyId || !dateStamp || !region || !service) {
    throw unauthorized('Malformed S3 credential scope');
  }

  return { accessKeyId, dateStamp, region, service, signedHeaders, signature };
}

export function verifySigV4Request(
  req: Request,
  secretAccessKey: string,
  expectedRegion: string,
): void {
  const authorization = parseSigV4Authorization(req.header('authorization'));
  if (authorization.service !== 's3') {
    throw unauthorized('Signature service mismatch');
  }
  if (authorization.region !== expectedRegion) {
    throw unauthorized('Signature region mismatch');
  }

  const amzDate = req.header('x-amz-date');
  if (!amzDate || !isFreshSigV4Timestamp(amzDate, authorization.dateStamp)) {
    throw unauthorized('S3 request date is missing, malformed, or stale');
  }

  const payloadHash =
    req.header('x-amz-content-sha256') ??
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const canonicalRequest = buildCanonicalRequest(req, authorization.signedHeaders, payloadHash);
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${authorization.dateStamp}/${authorization.region}/${authorization.service}/aws4_request`,
    hashHex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const signingKey = getSigningKey(
    secretAccessKey,
    authorization.dateStamp,
    authorization.region,
    authorization.service,
  );
  const expectedSignature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  if (!/^[a-f0-9]{64}$/i.test(authorization.signature)) {
    throw unauthorized('Malformed S3 signature');
  }

  const provided = Buffer.from(authorization.signature, 'hex');
  const expected = Buffer.from(expectedSignature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw unauthorized('Signature mismatch');
  }
}

const SIGV4_MAX_CLOCK_SKEW_MS = 15 * 60 * 1000;

function isFreshSigV4Timestamp(value: string, dateStamp: string): boolean {
  const match =
    /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})T(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})Z$/.exec(
      value,
    );
  if (!match?.groups || value.slice(0, 8) !== dateStamp) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().replace(/\.\d{3}Z$/, 'Z') !== value
  ) {
    return false;
  }

  return Math.abs(Date.now() - timestamp) <= SIGV4_MAX_CLOCK_SKEW_MS;
}

function buildCanonicalRequest(
  req: Request,
  signedHeaders: string[],
  payloadHash: string,
): string {
  const canonicalUri = encodeCanonicalUri(new URL(req.originalUrl, 'http://localhost').pathname);
  const canonicalQuery = buildCanonicalQuery(req.originalUrl);
  const headerMap = collectSignedHeaders(req, signedHeaders);
  const canonicalHeaders = `${signedHeaders
    .map((name) => `${name}:${headerMap.get(name) ?? ''}`)
    .join('\n')}\n`;
  const signedHeadersList = signedHeaders.join(';');

  return [
    req.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');
}

function collectSignedHeaders(req: Request, signedHeaders: string[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const name of signedHeaders) {
    const value =
      name === 'host'
        ? (req.get('host') ?? '')
        : (req.header(name) ?? req.header(name.toLowerCase()) ?? '');
    map.set(name, normalizeHeaderValue(value));
  }

  return map;
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function buildCanonicalQuery(originalUrl: string): string {
  const url = new URL(originalUrl, 'http://localhost');
  const entries = [...url.searchParams.entries()]
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

function encodeCanonicalUri(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => encodeURIComponent(segment).replace(/%2F/g, '/'))
    .join('/');
}

function hashHex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function getSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
