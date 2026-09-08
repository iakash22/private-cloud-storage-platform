export interface AccessTokenPayload {
  userId: string;
}

export interface GeneratedApiKey {
  plaintext: string;
  hash: string;
  prefix: string;
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

export const API_KEY_PREFIX = 'vs_ak_';
export const ACCESS_TOKEN_TYP = 'access';
export const SESSION_TOKEN_PREFIX = 'vs_sess_';
export const CSRF_TOKEN_PREFIX = 'vs_csrf_';
export const SHARE_TOKEN_PREFIX = 'vs_sh_';
