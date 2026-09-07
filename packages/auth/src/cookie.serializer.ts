import type { CookieOptions } from './types.js';

export class CookieSerializer {
  serialize(options: CookieOptions): string {
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

  parse(header: string | undefined): Record<string, string> {
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
}
