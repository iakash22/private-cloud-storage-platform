import { hashPassword } from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { conflict, notFound } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeUser } from '../../lib/serializers.js';

export function createUsersService(prisma: PrismaClient, nodeEnv: string) {
  return {
    async list(organizationId: string) {
      const assignments = await prisma.userRole.findMany({
        where: { organizationId },
        include: { user: true },
      });

      const uniqueUsers = new Map(assignments.map((item) => [item.user.id, item.user]));
      return [...uniqueUsers.values()]
        .sort((left, right) => left.email.localeCompare(right.email))
        .map(serializeUser);
    },

    async getInOrganization(organizationId: string, userId: string) {
      const membership = await prisma.userRole.findFirst({
        where: { organizationId, userId },
        include: { user: true },
      });

      if (!membership) {
        throw notFound('User not found in this organization');
      }

      return serializeUser(membership.user);
    },

    async create(
      organizationId: string,
      input: { email: string; password: string; name: string; roleId?: string },
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw conflict('A user with that email already exists');
      }

      const role =
        input.roleId === undefined
          ? await prisma.role.findFirst({
              where: { organizationId, name: 'Member', isSystem: true },
            })
          : await prisma.role.findFirst({
              where: { id: input.roleId, organizationId },
            });

      if (!role) {
        throw notFound('Role not found in this organization');
      }

      const user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await hashPassword(input.password, nodeEnv),
          name: input.name,
          userRoles: {
            create: {
              roleId: role.id,
              organizationId,
            },
          },
        },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'user.created',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { email: user.email, roleId: role.id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeUser(user);
    },

    async update(
      organizationId: string,
      userId: string,
      input: { name?: string; password?: string },
      actorUserId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const membership = await prisma.userRole.findFirst({
        where: { organizationId, userId },
      });
      if (!membership) {
        throw notFound('User not found in this organization');
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          passwordHash: input.password ? await hashPassword(input.password, nodeEnv) : undefined,
        },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId: actorUserId,
        action: 'user.updated',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeUser(user);
    },
  };
}
