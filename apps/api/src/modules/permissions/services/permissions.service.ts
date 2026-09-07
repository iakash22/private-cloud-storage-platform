import type { PrismaClient } from '@vaultstack/database';
import { serializePermission } from '../mappers/permission.mapper.js';

export class PermissionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
    });
    return permissions.map(serializePermission);
  }
}

export function createPermissionsService(prisma: PrismaClient): PermissionsService {
  return new PermissionsService(prisma);
}
