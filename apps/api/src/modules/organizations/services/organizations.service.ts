import type { PrismaClient } from '@vaultstack/database';
import { uniqueSlug } from '@vaultstack/database';
import { notFound } from '../../../lib/errors.js';
import { writeAuditLog } from '../../../lib/audit.js';
import { serializeOrganization } from '../mappers/organization.mapper.js';
import { createDefaultOrganizationRoles } from '../../auth/organization-roles.js';

export class OrganizationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async listForUser(userId: string) {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });

    const organizations = await this.prisma.organization.findMany({
      where: { id: { in: assignments.map((item) => item.organizationId) } },
      orderBy: { name: 'asc' },
    });

    return organizations.map(serializeOrganization);
  }

  async getById(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) {
      throw notFound('Organization not found');
    }
    return serializeOrganization(organization);
  }

  async create(
    userId: string,
    name: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const organization = await this.prisma.$transaction(async (tx) => {
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

    await writeAuditLog(this.prisma, {
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
  }

  async update(
    organizationId: string,
    name: string,
    userId: string,
    meta: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const existing = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!existing) {
      throw notFound('Organization not found');
    }

    const organization = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name },
    });

    await writeAuditLog(this.prisma, {
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
  }
}

export function createOrganizationsService(prisma: PrismaClient): OrganizationsService {
  return new OrganizationsService(prisma);
}
