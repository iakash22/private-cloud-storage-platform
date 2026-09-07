import type { AuthUser } from '@vaultstack/types';
import { ApiKeyService } from './api-key.service.js';
import { CookieSerializer } from './cookie.serializer.js';
import { CryptoUtil } from './crypto.util.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import {
  API_KEY_PREFIX,
  CSRF_TOKEN_PREFIX,
  SESSION_TOKEN_PREFIX,
  type AccessTokenPayload,
  type CookieOptions,
  type GeneratedApiKey,
} from './types.js';

export {
  API_KEY_PREFIX,
  CSRF_TOKEN_PREFIX,
  SESSION_TOKEN_PREFIX,
  ApiKeyService,
  CookieSerializer,
  CryptoUtil,
  PasswordService,
  TokenService,
};
export type { AccessTokenPayload, CookieOptions, GeneratedApiKey };

export function passwordHashRounds(nodeEnv: string): number {
  return new PasswordService(nodeEnv).getRounds();
}

export async function hashPassword(password: string, nodeEnv = 'production'): Promise<string> {
  return new PasswordService(nodeEnv).hash(password);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return new PasswordService('production').verify(password, passwordHash);
}

export async function signAccessToken(
  userId: string,
  secret: string,
  expiresIn = '12h',
): Promise<string> {
  return new TokenService(secret).signAccessToken(userId, expiresIn);
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenPayload> {
  return new TokenService(secret).verifyAccessToken(token);
}

export function hashToken(plaintext: string): string {
  return CryptoUtil.hashSha256(plaintext);
}

export function hashApiKey(plaintext: string): string {
  return new ApiKeyService().hash(plaintext);
}

export function generateSessionToken(): string {
  return new TokenService('unused-for-generation-only').generateSessionToken();
}

export function generateCsrfToken(): string {
  return new TokenService('unused-for-generation-only').generateCsrfToken();
}

export function serializeCookie(options: CookieOptions): string {
  return new CookieSerializer().serialize(options);
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  return new CookieSerializer().parse(header);
}

export function generateApiKey(): GeneratedApiKey {
  return new ApiKeyService().generate();
}

export function isApiKeyToken(token: string): boolean {
  return new ApiKeyService().isApiKeyFormat(token);
}

export function safeEqual(left: string, right: string): boolean {
  return CryptoUtil.timingSafeEqual(left, right);
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
