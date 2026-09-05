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

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
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
