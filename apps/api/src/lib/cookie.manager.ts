import { CookieSerializer } from '@vaultstack/auth';
import { CSRF_COOKIE_NAME, ORGANIZATION_COOKIE_NAME, SESSION_COOKIE_NAME } from '@vaultstack/types';
import type { EnvConfig } from '@vaultstack/config';
import type { Request, Response } from 'express';

export class CookieManager {
  private readonly serializer = new CookieSerializer();

  constructor(private readonly config: EnvConfig) {}

  read(req: Request): Record<string, string> {
    return this.serializer.parse(req.header('cookie'));
  }

  readSessionToken(req: Request): string | undefined {
    return this.read(req)[SESSION_COOKIE_NAME];
  }

  readCsrfToken(req: Request): string | undefined {
    return this.read(req)[CSRF_COOKIE_NAME];
  }

  readOrganizationId(req: Request): string | undefined {
    return this.read(req)[ORGANIZATION_COOKIE_NAME];
  }

  setSession(
    res: Response,
    tokens: { sessionToken: string; csrfToken: string },
  ): void {
    const secure = this.isSecure();

    this.appendCookie(res, {
      name: SESSION_COOKIE_NAME,
      value: tokens.sessionToken,
      maxAgeSeconds: this.config.SESSION_TTL_SECONDS,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    });

    this.appendCookie(res, {
      name: CSRF_COOKIE_NAME,
      value: tokens.csrfToken,
      maxAgeSeconds: this.config.SESSION_TTL_SECONDS,
      httpOnly: false,
      secure,
      sameSite: 'Lax',
    });
  }

  clearSession(res: Response): void {
    const secure = this.isSecure();

    this.appendCookie(res, {
      name: SESSION_COOKIE_NAME,
      value: '',
      maxAgeSeconds: 0,
      httpOnly: true,
      secure,
      sameSite: 'Lax',
    });

    this.appendCookie(res, {
      name: CSRF_COOKIE_NAME,
      value: '',
      maxAgeSeconds: 0,
      httpOnly: false,
      secure,
      sameSite: 'Lax',
    });

    this.clearOrganization(res);
  }

  setOrganization(res: Response, organizationId: string): void {
    this.appendCookie(res, {
      name: ORGANIZATION_COOKIE_NAME,
      value: organizationId,
      maxAgeSeconds: this.config.SESSION_TTL_SECONDS,
      httpOnly: true,
      secure: this.isSecure(),
      sameSite: 'Lax',
    });
  }

  clearOrganization(res: Response): void {
    this.appendCookie(res, {
      name: ORGANIZATION_COOKIE_NAME,
      value: '',
      maxAgeSeconds: 0,
      httpOnly: true,
      secure: this.isSecure(),
      sameSite: 'Lax',
    });
  }

  private isSecure(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  private appendCookie(
    res: Response,
    options: {
      name: string;
      value: string;
      maxAgeSeconds: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'Lax' | 'Strict' | 'None';
    },
  ): void {
    res.append('Set-Cookie', this.serializer.serialize(options));
  }
}
