import type { PrismaClient } from '@vaultstack/database';
import { uniqueSlug } from '@vaultstack/database';
import { notFound } from '../../lib/errors.js';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeOrganization } from '../../lib/serializers.js';
import { createDefaultOrganizationRoles } from '../auth/organization-roles.js';

export function createOrganizationsService(prisma: PrismaClient) {
  return {
    async listForUser(userId: string) {
      const assignments = await prisma.userRole.findMany({
        where: { userId },
        select: { organizationId: true },
        distinct: ['organizationId'],
      });

      const organizations = await prisma.organization.findMany({
        where: { id: { in: assignments.map((item) => item.organizationId) } },
        orderBy: { name: 'asc' },
      });

      return organizations.map(serializeOrganization);
    },

    async getById(organizationId: string) {
      const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!organization) {
        throw notFound('Organization not found');
      }
      return serializeOrganization(organization);
    },

    async create(
      userId: string,
      name: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const organization = await prisma.$transaction(async (tx) => {
        const created = await tx.organization.create({
          data: {
            name,
            slug: uniqueSlug(name),
          },
        });

        const roles = await createDefaultOrganizationRoles(tx, created.id);
        await tx.userRole.create({
          data: {
            userId,
            roleId: roles.SUPER_ADMIN,
            organizationId: created.id,
          },
        });

        return created;
      });

      await writeAuditLog(prisma, {
        organizationId: organization.id,
        userId,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: organization.id,
        metadata: { name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeOrganization(organization);
    },

    async update(
      organizationId: string,
      name: string,
      userId: string,
      meta: { ipAddress?: string | null; userAgent?: string | null },
    ) {
      const existing = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!existing) {
        throw notFound('Organization not found');
      }

      const organization = await prisma.organization.update({
        where: { id: organizationId },
        data: { name },
      });

      await writeAuditLog(prisma, {
        organizationId,
        userId,
        action: 'organization.updated',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: { name },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return serializeOrganization(organization);
    },
  };
}
