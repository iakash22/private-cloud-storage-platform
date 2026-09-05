import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { AuthUser } from '@vaultstack/types';

const API_KEY_PREFIX = 'vs_ak_';
const ACCESS_TOKEN_TYP = 'access';

export interface AccessTokenPayload {
  userId: string;
}

export interface GeneratedApiKey {
  plaintext: string;
  hash: string;
  prefix: string;
}

export function passwordHashRounds(nodeEnv: string): number {
  return nodeEnv === 'test' ? 4 : 10;
}

export async function hashPassword(password: string, nodeEnv = 'production'): Promise<string> {
  return bcrypt.hash(password, passwordHashRounds(nodeEnv));
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  userId: string,
  secret: string,
  expiresIn = '12h',
): Promise<string> {
  return new SignJWT({ typ: ACCESS_TOKEN_TYP })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret));

  if (
    payload.typ !== ACCESS_TOKEN_TYP ||
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0
  ) {
    throw new Error('Invalid access token');
  }

  return { userId: payload.sub };
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function hashApiKey(plaintext: string): string {
  return hashToken(plaintext);
}

export const SESSION_TOKEN_PREFIX = 'vs_sess_';
export const CSRF_TOKEN_PREFIX = 'vs_csrf_';

export function generateSessionToken(): string {
  return `${SESSION_TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function generateCsrfToken(): string {
  return `${CSRF_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

export interface CookieOptions {
  name: string;
  value: string;
  maxAgeSeconds: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
  path?: string;
}

export function serializeCookie(options: CookieOptions): string {
  const parts = [
    `${options.name}=${encodeURIComponent(options.value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    `SameSite=${options.sameSite}`,
  ];

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name.length === 0) {
      continue;
    }
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 12),
  };
}

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function toPublicUser(user: AuthUser & { createdAt: Date; updatedAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
