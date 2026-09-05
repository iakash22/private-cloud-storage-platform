import { hashApiKey, isApiKeyToken, verifyAccessToken } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import type { EnvConfig } from '@vaultstack/config';
import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { getUserOrganizationIds } from '../modules/auth/organization-roles.js';
import type { AuthContext } from '../modules/auth/auth.types.js';

export function createAuthenticateMiddleware(prisma: PrismaClient, config: EnvConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header('authorization');
      if (!header?.startsWith('Bearer ')) {
        throw unauthorized('Authentication is required');
      }

      const token = header.slice('Bearer '.length).trim();
      if (!token) {
        throw unauthorized('Authentication is required');
      }

      req.auth = isApiKeyToken(token)
        ? await authenticateApiKey(prisma, token)
        : await authenticateJwt(prisma, token, config.JWT_SECRET);

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

  return {
    user: { id: user.id, email: user.email, name: user.name },
    organizationIds: await getUserOrganizationIds(prisma, user.id),
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

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    user: { id: apiKey.user.id, email: apiKey.user.email, name: apiKey.user.name },
    organizationIds: [apiKey.organizationId],
    apiKeyId: apiKey.id,
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw unauthorized('Authentication is required');
  }
  return req.auth;
}
