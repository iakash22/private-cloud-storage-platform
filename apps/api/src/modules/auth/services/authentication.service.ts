import { ApiKeyService, TokenService } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { CSRF_HEADER_NAME } from '@vaultstack/types';
import type { Request } from 'express';
import type { CookieManager } from '../../../lib/cookie.manager.js';
import { forbidden, unauthorized } from '../../../lib/errors.js';
import { getUserOrganizationIds } from '../organization-roles.js';
import type { AuthContext } from '../auth.types.js';
import type { SessionManager } from './session.manager.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class AuthenticationService {
  private readonly tokens: TokenService;
  private readonly apiKeys: ApiKeyService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionManager,
    private readonly cookies: CookieManager,
    jwtSecret: string,
  ) {
    this.tokens = new TokenService(jwtSecret);
    this.apiKeys = new ApiKeyService();
  }

  async authenticate(req: Request): Promise<AuthContext> {
    const header = req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      if (!token) {
        throw unauthorized('Authentication is required');
      }

      return this.apiKeys.isApiKeyFormat(token)
        ? this.authenticateApiKey(token)
        : this.authenticateJwt(token);
    }

    return this.authenticateSession(req);
  }

  private async authenticateJwt(token: string): Promise<AuthContext> {
    let userId: string;
    try {
      ({ userId } = await this.tokens.verifyAccessToken(token));
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw unauthorized('Invalid or expired token');
    }
    if (user.disabledAt) {
      throw forbidden('This account is disabled');
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organizationIds: await getUserOrganizationIds(this.prisma, user.id),
      method: 'jwt',
    };
  }

  private async authenticateApiKey(token: string): Promise<AuthContext> {
    const keyHash = this.apiKeys.hash(token);
    const apiKey = await this.prisma.apiKey.findUnique({
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

    await this.prisma.apiKey.update({
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

  private async authenticateSession(req: Request): Promise<AuthContext> {
    const sessionToken = this.cookies.readSessionToken(req);
    if (!sessionToken) {
      throw unauthorized('Authentication is required');
    }

    const session = await this.sessions.resolve(sessionToken);
    if (!session) {
      throw unauthorized('Invalid or expired session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      throw unauthorized('Invalid or expired session');
    }
    if (user.disabledAt) {
      throw forbidden('This account is disabled');
    }

    if (MUTATING_METHODS.has(req.method)) {
      const csrfToken = req.header(CSRF_HEADER_NAME);
      if (!csrfToken || !(await this.sessions.verifyCsrf(session.id, csrfToken))) {
        throw forbidden('CSRF token is missing or invalid');
      }
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      organizationIds: await getUserOrganizationIds(this.prisma, user.id),
      sessionId: session.id,
      method: 'session',
    };
  }
}
