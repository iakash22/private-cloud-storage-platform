import { TokenService } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import type { RequestMeta } from '@vaultstack/types';

export interface SessionTokens {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
}

export class SessionManager {
  private readonly tokens: TokenService;

  constructor(
    private readonly prisma: PrismaClient,
    jwtSecret: string,
    private readonly ttlSeconds: number,
  ) {
    this.tokens = new TokenService(jwtSecret);
  }

  async create(userId: string, meta: RequestMeta, previousToken?: string): Promise<SessionTokens> {
    if (previousToken) {
      await this.revokeByToken(previousToken);
    }

    const sessionToken = this.tokens.generateSessionToken();
    const csrfToken = this.tokens.generateCsrfToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.tokens.hashToken(sessionToken),
        csrfHash: this.tokens.hashToken(csrfToken),
        expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    return { sessionId: session.id, sessionToken, csrfToken };
  }

  async resolve(sessionToken: string): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokens.hashToken(sessionToken) },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return { id: session.id, userId: session.userId };
  }

  async verifyCsrf(sessionId: string, csrfToken: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) {
      return false;
    }
    return session.csrfHash === this.tokens.hashToken(csrfToken);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeByToken(sessionToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: this.tokens.hashToken(sessionToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async expire(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(0) },
    });
  }
}

export type SessionService = SessionManager;

export function createSessionService(
  prisma: PrismaClient,
  ttlSeconds: number,
  jwtSecret = 'unused',
) {
  return new SessionManager(prisma, jwtSecret, ttlSeconds);
}
