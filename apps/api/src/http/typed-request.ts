import type { z } from 'zod';
import type { Request } from 'express';
import type { RequestCookies, RequestMeta } from '@vaultstack/types';
import { readCookies } from '../lib/cookies.js';
import { requestMeta } from '../lib/audit.js';
import { requireAuth } from '../middleware/authenticate.js';
import type { AuthContext } from '../modules/auth/auth.types.js';

export class TypedRequest<
  TParams = Record<string, string>,
  TBody = unknown,
  TQuery = Record<string, unknown>,
> {
  constructor(
    private readonly req: Request,
    readonly params: TParams,
    readonly body: TBody,
    readonly query: TQuery,
  ) {}

  get auth(): AuthContext {
    return requireAuth(this.req);
  }

  get cookies(): RequestCookies {
    return readCookies(this.req) as RequestCookies;
  }

  meta(): RequestMeta {
    return requestMeta(this.req);
  }

  get requestId(): string {
    return this.req.requestId;
  }
}

export function fromValidated<
  P extends z.ZodTypeAny,
  B extends z.ZodTypeAny,
  Q extends z.ZodTypeAny,
>(req: Request, paramsSchema: P, bodySchema: B, querySchema: Q) {
  return new TypedRequest(
    req,
    paramsSchema.parse(req.params),
    bodySchema.parse(req.body),
    querySchema.parse(req.query),
  );
}
