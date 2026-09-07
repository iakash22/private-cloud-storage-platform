import { parseCookieHeader } from '@vaultstack/auth';
import type { EnvConfig } from '@vaultstack/config';
import type { Request, Response } from 'express';
import { CookieManager } from './cookie.manager.js';

let defaultCookieManager: CookieManager | undefined;

export function bindCookieManager(manager: CookieManager): void {
  defaultCookieManager = manager;
}

function getCookieManager(config: EnvConfig): CookieManager {
  return defaultCookieManager ?? new CookieManager(config);
}

export function readCookies(req: Request): Record<string, string> {
  if (defaultCookieManager) {
    return defaultCookieManager.read(req);
  }
  return parseCookieHeader(req.header('cookie'));
}

export function cookieSecure(config: EnvConfig): boolean {
  return config.NODE_ENV === 'production';
}

export function setSessionCookies(
  res: Response,
  config: EnvConfig,
  tokens: { sessionToken: string; csrfToken: string },
): void {
  getCookieManager(config).setSession(res, tokens);
}

export function clearSessionCookies(res: Response, config: EnvConfig): void {
  getCookieManager(config).clearSession(res);
}

export function setOrganizationCookie(
  res: Response,
  config: EnvConfig,
  organizationId: string,
): void {
  getCookieManager(config).setOrganization(res, organizationId);
}

export function clearOrganizationCookie(res: Response, config: EnvConfig): void {
  getCookieManager(config).clearOrganization(res);
}

export { CookieManager } from './cookie.manager.js';
