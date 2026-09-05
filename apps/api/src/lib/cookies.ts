import { parseCookieHeader, serializeCookie, type CookieOptions } from '@vaultstack/auth';
import { CSRF_COOKIE_NAME, ORGANIZATION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@vaultstack/types';
import type { EnvConfig } from '@vaultstack/config';
import type { Request, Response } from 'express';

export function readCookies(req: Request): Record<string, string> {
  return parseCookieHeader(req.header('cookie'));
}

export function cookieSecure(config: EnvConfig): boolean {
  return config.NODE_ENV === 'production';
}

function appendCookie(res: Response, options: CookieOptions): void {
  res.append('Set-Cookie', serializeCookie(options));
}

export function setSessionCookies(
  res: Response,
  config: EnvConfig,
  tokens: { sessionToken: string; csrfToken: string },
): void {
  const secure = cookieSecure(config);

  appendCookie(res, {
    name: SESSION_COOKIE_NAME,
    value: tokens.sessionToken,
    maxAgeSeconds: config.SESSION_TTL_SECONDS,
    httpOnly: true,
    secure,
    sameSite: 'Lax',
  });

  appendCookie(res, {
    name: CSRF_COOKIE_NAME,
    value: tokens.csrfToken,
    maxAgeSeconds: config.SESSION_TTL_SECONDS,
    httpOnly: false,
    secure,
    sameSite: 'Lax',
  });
}

export function clearSessionCookies(res: Response, config: EnvConfig): void {
  const secure = cookieSecure(config);

  appendCookie(res, {
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAgeSeconds: 0,
    httpOnly: true,
    secure,
    sameSite: 'Lax',
  });

  appendCookie(res, {
    name: CSRF_COOKIE_NAME,
    value: '',
    maxAgeSeconds: 0,
    httpOnly: false,
    secure,
    sameSite: 'Lax',
  });

  clearOrganizationCookie(res, config);
}

/**
 * Records which organization the browser is acting on.
 *
 * httpOnly so page scripts cannot rewrite it, but it is still only a selector:
 * the server re-validates it against persisted memberships on every request.
 */
export function setOrganizationCookie(
  res: Response,
  config: EnvConfig,
  organizationId: string,
): void {
  appendCookie(res, {
    name: ORGANIZATION_COOKIE_NAME,
    value: organizationId,
    maxAgeSeconds: config.SESSION_TTL_SECONDS,
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: 'Lax',
  });
}

export function clearOrganizationCookie(res: Response, config: EnvConfig): void {
  appendCookie(res, {
    name: ORGANIZATION_COOKIE_NAME,
    value: '',
    maxAgeSeconds: 0,
    httpOnly: true,
    secure: cookieSecure(config),
    sameSite: 'Lax',
  });
}
