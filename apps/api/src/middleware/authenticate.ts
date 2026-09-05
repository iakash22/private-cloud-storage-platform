import { hashApiKey, isApiKeyToken, verifyAccessToken } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import type { EnvConfig } from '@vaultstack/config';
import { CSRF_HEADER_NAME, SESSION_COOKIE_NAME } from '@vaultstack/types';
import type { NextFunction, Request, Response } from 'express';
import { readCookies } from '../lib/cookies.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { getUserOrganizationIds } from '../modules/auth/organization-roles.js';
import type { AuthContext } from '../modules/auth/auth.types.js';
import type { SessionService } from '../modules/auth/session.service.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createAuthenticateMiddleware(
  prisma: PrismaClient,
  config: EnvConfig,
  sessions: SessionService,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header('authorization');
      if (header?.startsWith('Bearer ')) {
        const token = header.slice('Bearer '.length).trim();
        if (!token) {
          throw unauthorized('Authentication is required');
        }

        req.auth = isApiKeyToken(token)
          ? await authenticateApiKey(prisma, token)
          : await authenticateJwt(prisma, token, config.JWT_SECRET);
        next();
        return;
      }

      const cookies = readCookies(req);
      const sessionToken = cookies[SESSION_COOKIE_NAME];
      if (!sessionToken) {
        throw unauthorized('Authentication is required');
      }

      const session = await sessions.resolve(sessionToken);
      if (!session) {
        throw unauthorized('Invalid or expired session');
      }

      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) {
        throw unauthorized('Invalid or expired session');
      }
      if (user.disabledAt) {
        throw forbidden('This account is disabled');
      }

      if (MUTATING_METHODS.has(req.method)) {
        const csrfToken = req.header(CSRF_HEADER_NAME);
        if (!csrfToken || !(await sessions.verifyCsrf(session.id, csrfToken))) {
          throw forbidden('CSRF token is missing or invalid');
        }
      }

      req.auth = {
        user: { id: user.id, email: user.email, name: user.name },
        organizationIds: await getUserOrganizationIds(prisma, user.id),
        sessionId: session.id,
        method: 'session',
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function authenticateJwt(
  prisma: PrismaClient,
  token: string,
  secret: string,
): Promise<AuthContext> {
  let userId: string;
  try {
    ({ userId } = await verifyAccessToken(token, secret));
  } catch {
    throw unauthorized('Invalid or expired token');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized('Invalid or expired token');
  }
  if (user.disabledAt) {
    throw forbidden('This account is disabled');
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
    organizationIds: await getUserOrganizationIds(prisma, user.id),
    method: 'jwt',
  };
}

async function authenticateApiKey(prisma: PrismaClient, token: string): Promise<AuthContext> {
  const keyHash = hashApiKey(token);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { user: true },
  });

  if (
    !apiKey ||
    apiKey.revokedAt ||
    (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now())
  ) {
    throw unauthorized('Invalid or expired API key');
  }

  if (apiKey.user.disabledAt) {
    throw forbidden('This account is disabled');
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    user: { id: apiKey.user.id, email: apiKey.user.email, name: apiKey.user.name },
    organizationIds: [apiKey.organizationId],
    apiKeyId: apiKey.id,
    method: 'api-key',
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw unauthorized('Authentication is required');
  }
  return req.auth;
}
