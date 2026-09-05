import type { Response } from 'supertest';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '@vaultstack/types';

/**
 * Narrows a typed JSON body out of a loosely-typed supertest response.
 * The type parameter is intentional: callers supply the expected shape.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- intentional call-site narrowing
export function responseBody<T>(response: Response): T {
  return response.body as T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export function errorBody(response: Response): ApiErrorBody['error'] {
  return responseBody<ApiErrorBody>(response).error;
}

/** supertest types `headers` loosely, so Set-Cookie is narrowed once here. */
function setCookies(response: Response): string[] {
  const raw: unknown = response.headers['set-cookie'];

  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }

  return typeof raw === 'string' ? [raw] : [];
}

export function cookieHeader(response: Response): string {
  return setCookies(response)
    .map((entry) => entry.split(';')[0])
    .filter((part): part is string => Boolean(part))
    .join('; ');
}

export function sessionCookieFlags(response: Response): string {
  return setCookies(response).find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
}

export function csrfFromResponse(response: Response): string {
  const body = responseBody<{ csrfToken?: string }>(response);
  if (typeof body.csrfToken === 'string' && body.csrfToken.length > 0) {
    return body.csrfToken;
  }

  const cookies = cookieHeader(response)
    .split(';')
    .map((part) => part.trim());
  const csrf = cookies.find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  return csrf ? decodeURIComponent(csrf.slice(`${CSRF_COOKIE_NAME}=`.length)) : '';
}

export function authHeaders(response: Response): { Cookie: string; [CSRF_HEADER_NAME]: string } {
  return {
    Cookie: cookieHeader(response),
    [CSRF_HEADER_NAME]: csrfFromResponse(response),
  };
}
