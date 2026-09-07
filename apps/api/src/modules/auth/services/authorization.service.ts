import type { PrismaClient } from '@vaultstack/database';
import type { AuthorizationResource, AuthUser } from '@vaultstack/types';

export interface PermissionResolver {
  getPermissionKeys(userId: string, organizationId: string): Promise<string[]>;
}

export class AuthorizationService {
  constructor(private readonly resolver: PermissionResolver) {}

  async can(
    user: Pick<AuthUser, 'id'>,
    permission: string,
    resource: AuthorizationResource,
  ): Promise<boolean> {
    if (!user.id || !permission || !resource.organizationId) {
      return false;
    }

    const keys = await this.resolver.getPermissionKeys(user.id, resource.organizationId);
    return keys.includes(permission);
  }
}

export function createAuthorizationService(resolver: PermissionResolver): AuthorizationService {
  return new AuthorizationService(resolver);
}

export function createPrismaPermissionResolver(prisma: PrismaClient): PermissionResolver {
  return {
    async getPermissionKeys(userId, organizationId) {
      const assignments = await prisma.userRole.findMany({
        where: { userId, organizationId },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      return [
        ...new Set(
          assignments.flatMap((assignment) =>
            assignment.role.permissions.map((item) => item.permission.key),
          ),
        ),
      ];
    },
  };
}
