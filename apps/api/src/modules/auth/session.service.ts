import { generateCsrfToken, generateSessionToken, hashToken } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';

export interface SessionTokens {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
}

export function createSessionService(prisma: PrismaClient, ttlSeconds: number) {
  return {
    async create(
      userId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
      previousToken?: string,
    ): Promise<SessionTokens> {
      if (previousToken) {
        await this.revokeByToken(previousToken);
      }

      const sessionToken = generateSessionToken();
      const csrfToken = generateCsrfToken();
      const session = await prisma.session.create({
        data: {
          userId,
          tokenHash: hashToken(sessionToken),
          csrfHash: hashToken(csrfToken),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
          ipAddress: meta.ipAddress ?? null,
          userAgent: meta.userAgent ?? null,
        },
      });

      return { sessionId: session.id, sessionToken, csrfToken };
    },

    async resolve(sessionToken: string): Promise<SessionRecord | null> {
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(sessionToken) },
      });

      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
        return null;
      }

      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });

      return { id: session.id, userId: session.userId };
    },

    async verifyCsrf(sessionId: string, csrfToken: string): Promise<boolean> {
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session || session.revokedAt) {
        return false;
      }
      return session.csrfHash === hashToken(csrfToken);
    },

    async revoke(sessionId: string): Promise<void> {
      await prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async revokeByToken(sessionToken: string): Promise<void> {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(sessionToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async expire(sessionId: string): Promise<void> {
      await prisma.session.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(0) },
      });
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
