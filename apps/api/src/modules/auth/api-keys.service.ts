import { generateApiKey } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { notFound } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeApiKey } from '../../lib/serializers.js';

export function createApiKeysService(prisma: PrismaClient) {
  return {
    async list(organizationId: string) {
      const keys = await prisma.apiKey.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
      return keys.map(serializeApiKey);
    },

    async create(
      organizationId: string,
      userId: string,
      input: { name: string; expiresAt?: string },
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const generated = generateApiKey();
      const apiKey = await prisma.apiKey.create({
        data: {
          organizationId,
          userId,
          name: input.name,
          keyHash: generated.hash,
          prefix: generated.prefix,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'api_key.created',
        resourceType: 'api_key',
        resourceId: apiKey.id,
        metadata: { name: input.name, prefix: generated.prefix },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return {
        ...serializeApiKey(apiKey),
        token: generated.plaintext,
      };
    },

    async revoke(
      organizationId: string,
      apiKeyId: string,
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const apiKey = await prisma.apiKey.findFirst({
        where: { id: apiKeyId, organizationId },
      });
      if (!apiKey) {
        throw notFound('API key not found');
      }

      const revoked = await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { revokedAt: new Date() },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'api_key.revoked',
        resourceType: 'api_key',
        resourceId: apiKeyId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeApiKey(revoked);
    },
  };
}
