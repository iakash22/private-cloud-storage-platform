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

export interface ActiveSessionRow {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

function nonEmptyTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed == null || trimmed.length === 0) {
    return null;
  }
  return trimmed;
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

  async resolve(sessionToken: string, meta?: RequestMeta): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.tokens.hashToken(sessionToken) },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const nextIp = nonEmptyTrim(meta?.ipAddress);
    const nextUa = nonEmptyTrim(meta?.userAgent);
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(),
        ...(nextIp && nextIp !== session.ipAddress ? { ipAddress: nextIp } : {}),
        ...(nextUa && nextUa !== session.userAgent ? { userAgent: nextUa } : {}),
      },
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

  async listActiveByUser(userId: string): Promise<ActiveSessionRow[]> {
    const now = new Date();
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke a session only when it belongs to the given user. Returns whether a row was updated. */
  async revokeOwned(userId: string, sessionId: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Revoke every active session for the user except the current one. */
  async revokeOthers(
    userId: string,
    exceptSessionId: string,
  ): Promise<{ count: number; revokedSessionIds: string[] }> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        id: { not: exceptSessionId },
        revokedAt: null,
      },
      select: { id: true },
    });
    if (sessions.length === 0) {
      return { count: 0, revokedSessionIds: [] };
    }

    await this.prisma.session.updateMany({
      where: {
        userId,
        id: { not: exceptSessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { count: sessions.length, revokedSessionIds: sessions.map((row) => row.id) };
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
