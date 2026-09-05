import type { PrismaClient } from '@vaultstack/database';
import { serializePermission } from '../../lib/serializers.js';

export function createPermissionsService(prisma: PrismaClient) {
  return {
    async list() {
      const permissions = await prisma.permission.findMany({
        orderBy: { key: 'asc' },
      });
      return permissions.map(serializePermission);
    },
  };
}
