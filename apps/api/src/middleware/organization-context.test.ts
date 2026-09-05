import { ORGANIZATION_COOKIE_NAME, ORGANIZATION_HEADER_NAME } from '@vaultstack/types';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { AppError } from '../lib/errors.js';
import { currentOrganizationId, requireOrganizationContext } from './organization-context.js';

interface AuthLike {
  method: 'session' | 'jwt' | 'api-key';
  organizationIds: string[];
}

function request(options: { auth?: AuthLike; cookie?: string; header?: string }): Request {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) {
    headers.cookie = `${ORGANIZATION_COOKIE_NAME}=${options.cookie}`;
  }
  if (options.header !== undefined) {
    headers[ORGANIZATION_HEADER_NAME.toLowerCase()] = options.header;
  }

  return {
    auth: options.auth ? { ...options.auth, user: { id: 'user-1' } } : undefined,
    headers,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

/** Runs the middleware and returns either the resolved org or the error code. */
function run(req: Request): { organizationId?: string; code?: string } {
  let captured: unknown;
  const next: NextFunction = (error?: unknown) => {
    captured = error;
  };

  requireOrganizationContext(req, {} as Response, next);

  if (captured) {
    expect(captured).toBeInstanceOf(AppError);
    return { code: (captured as AppError).code };
  }

  return { organizationId: req.organizationId };
}

describe('requireOrganizationContext', () => {
  it('requires authentication', () => {
    expect(run(request({})).code).toBe('UNAUTHORIZED');
  });

  it('uses the sole organization when the caller belongs to exactly one', () => {
    const result = run(request({ auth: { method: 'session', organizationIds: ['org-1'] } }));

    expect(result.organizationId).toBe('org-1');
  });

  it('rejects ambiguity instead of guessing between organizations', () => {
    const result = run(
      request({ auth: { method: 'session', organizationIds: ['org-1', 'org-2'] } }),
    );

    expect(result.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
  });

  it('accepts a cookie selector that matches a membership', () => {
    const result = run(
      request({
        auth: { method: 'session', organizationIds: ['org-1', 'org-2'] },
        cookie: 'org-2',
      }),
    );

    expect(result.organizationId).toBe('org-2');
  });

  it('accepts a header selector, for non-browser clients', () => {
    const result = run(
      request({
        auth: { method: 'jwt', organizationIds: ['org-1', 'org-2'] },
        header: 'org-2',
      }),
    );

    expect(result.organizationId).toBe('org-2');
  });

  it('rejects a forged selector for an organization the caller is not in', () => {
    // The core cross-organization protection: the cookie is only a selector,
    // and membership is re-derived from persisted role assignments.
    const result = run(
      request({
        auth: { method: 'session', organizationIds: ['org-1'] },
        cookie: 'org-victim',
      }),
    );

    expect(result.code).toBe('STORAGE_ACCESS_DENIED');
  });

  it('reports a non-existent organization the same way as an unauthorized one', () => {
    const forged = run(
      request({ auth: { method: 'session', organizationIds: ['org-1'] }, cookie: 'org-victim' }),
    );
    const nonsense = run(
      request({ auth: { method: 'session', organizationIds: ['org-1'] }, cookie: 'not-an-id' }),
    );

    // Identical responses, so the selector cannot enumerate organization ids.
    expect(forged.code).toBe(nonsense.code);
  });

  it('rejects a selector even when the caller belongs to exactly one organization', () => {
    const result = run(
      request({ auth: { method: 'session', organizationIds: ['org-1'] }, cookie: 'org-2' }),
    );

    expect(result.code).toBe('STORAGE_ACCESS_DENIED');
    expect(result.organizationId).toBeUndefined();
  });

  it('pins API keys to their own organization and ignores any selector', () => {
    const result = run(
      request({
        auth: { method: 'api-key', organizationIds: ['org-key'] },
        cookie: 'org-2',
        header: 'org-3',
      }),
    );

    expect(result.organizationId).toBe('org-key');
  });

  it('rejects an API key with no organization rather than falling through', () => {
    const result = run(request({ auth: { method: 'api-key', organizationIds: [] } }));

    expect(result.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
  });

  it('rejects a caller with no memberships at all', () => {
    const result = run(request({ auth: { method: 'session', organizationIds: [] } }));

    expect(result.code).toBe('ORGANIZATION_CONTEXT_REQUIRED');
  });

  it('prefers the cookie over the header when both are present', () => {
    const result = run(
      request({
        auth: { method: 'session', organizationIds: ['org-1', 'org-2'] },
        cookie: 'org-1',
        header: 'org-2',
      }),
    );

    expect(result.organizationId).toBe('org-1');
  });
});

describe('currentOrganizationId', () => {
  it('returns the organization resolved by the middleware', () => {
    const req = request({ auth: { method: 'session', organizationIds: ['org-1'] } });
    run(req);

    expect(currentOrganizationId(req)).toBe('org-1');
  });

  it('throws rather than returning undefined when the middleware did not run', () => {
    expect(() => currentOrganizationId(request({}))).toThrow(AppError);
  });
});
