import {
  PasswordService,
  TokenService,
  TotpService,
  decryptSecret,
  deriveSecretKey,
  encryptSecret,
  qrSvg,
} from '@vaultstack/auth';
import type { PrismaClient } from '@vaultstack/database';
import { uniqueSlug } from '@vaultstack/database';
import type { PublicAuthSession, PublicMembership, RequestMeta } from '@vaultstack/types';
import { conflict, forbidden, notFound, totpInvalid, unauthorized } from '../../../lib/errors.js';
import { writeAuditLog } from '../../../lib/audit.js';
import { serializeOrganization, serializeUser } from '../../../lib/serializers.js';
import { createDefaultOrganizationRoles, getUserOrganizationIds } from '../organization-roles.js';
import { lookupIpGeoMany } from './ip-geo.service.js';
import type { SessionManager, SessionTokens } from './session.manager.js';
import { parseUserAgent } from './user-agent.js';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyTotpLoginInput {
  challengeToken: string;
  code: string;
}

export interface SessionMeta extends RequestMeta {
  previousSessionToken?: string;
}

interface LoginSessionResult {
  user: ReturnType<typeof serializeUser>;
  organizations: ReturnType<typeof serializeOrganization>[];
  memberships: PublicMembership[];
  csrfToken: string;
  session: SessionTokens;
}

interface LoginChallengeResult {
  totpRequired: true;
  challengeToken: string;
}

async function loadMemberships(
  prisma: PrismaClient,
  userId: string,
): Promise<{
  organizations: ReturnType<typeof serializeOrganization>[];
  memberships: PublicMembership[];
}> {
  const assignments = await prisma.userRole.findMany({
    where: { userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  const organizationIds = [...new Set(assignments.map((item) => item.organizationId))];
  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    orderBy: { name: 'asc' },
  });

  const memberships = organizationIds.map((organizationId) => {
    const orgAssignments = assignments.filter((item) => item.organizationId === organizationId);
    return {
      organizationId,
      roles: [...new Set(orgAssignments.map((item) => item.role.name))],
      permissions: [
        ...new Set(
          orgAssignments.flatMap((item) =>
            item.role.permissions.map((entry) => entry.permission.key),
          ),
        ),
      ],
    };
  });

  return {
    organizations: organizations.map(serializeOrganization),
    memberships,
  };
}

export class AuthService {
  private readonly passwords: PasswordService;
  private readonly tokens: TokenService;
  private readonly totp = new TotpService();
  private readonly totpKey: Buffer;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionManager,
    nodeEnv: string,
    jwtSecret: string,
  ) {
    this.passwords = new PasswordService(nodeEnv);
    this.tokens = new TokenService(jwtSecret);
    this.totpKey = deriveSecretKey(jwtSecret, 'totp-secret');
  }

  async register(input: RegisterInput, meta: SessionMeta) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw conflict('A user with that email already exists', {
        email: 'A user with that email already exists',
      });
    }

    const passwordHash = await this.passwords.hash(input.password);
    const slug = uniqueSlug(input.organizationName);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          name: input.name,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      const roles = await createDefaultOrganizationRoles(tx, organization.id);

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: roles.SUPER_ADMIN,
          organizationId: organization.id,
        },
      });

      return { user, organization };
    });

    await writeAuditLog(this.prisma, {
      organizationId: result.organization.id,
      userId: result.user.id,
      action: 'auth.register',
      resourceType: 'organization',
      resourceId: result.organization.id,
      metadata: { email: result.user.email },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const session = await this.sessions.create(result.user.id, meta);
    const memberships = await loadMemberships(this.prisma, result.user.id);

    return {
      user: serializeUser(result.user),
      organization: serializeOrganization(result.organization),
      organizations: memberships.organizations,
      memberships: memberships.memberships,
      csrfToken: session.csrfToken,
      session,
    };
  }

  async login(
    input: LoginInput,
    meta: SessionMeta,
  ): Promise<LoginSessionResult | LoginChallengeResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw unauthorized('Invalid email or password');
    }

    if (!(await this.passwords.verify(input.password, user.passwordHash))) {
      await this.recordLoginFailure(user.id, 'invalid_credentials', meta);
      throw unauthorized('Invalid email or password');
    }

    if (user.disabledAt) {
      await this.recordLoginFailure(user.id, 'account_disabled', meta);
      throw forbidden('This account is disabled');
    }

    if (user.totpEnabledAt) {
      const challengeToken = await this.tokens.signTotpChallenge(user.id);
      return { totpRequired: true, challengeToken };
    }

    return this.issueLoginSession(user.id, meta);
  }

  async verifyTotpLogin(
    input: VerifyTotpLoginInput,
    meta: SessionMeta,
  ): Promise<LoginSessionResult> {
    let userId: string;
    try {
      ({ userId } = await this.tokens.verifyTotpChallenge(input.challengeToken));
    } catch {
      throw unauthorized('Invalid or expired authenticator challenge');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.totpEnabledAt) {
      throw unauthorized('Invalid or expired authenticator challenge');
    }

    if (user.disabledAt) {
      throw forbidden('This account is disabled');
    }

    const remainingBackupHashes = this.verifyUserTotpOrBackup(user, input.code);
    if (remainingBackupHashes === undefined) {
      await this.recordLoginFailure(user.id, 'totp_invalid', meta);
      throw totpInvalid();
    }

    if (remainingBackupHashes !== user.totpBackupCodeHashes) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { totpBackupCodeHashes: remainingBackupHashes },
      });
    }

    return this.issueLoginSession(user.id, meta);
  }

  async setupTotp(userId: string, meta: RequestMeta) {
    const user = await this.requireActiveUser(userId);
    if (user.totpEnabledAt) {
      throw conflict('Two-factor authentication is already enabled');
    }

    const secret = this.totp.generateSecret();
    const otpauthUri = this.totp.otpauthUri(user.email, secret);
    const sealed = encryptSecret(secret, this.totpKey);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecretCiphertext: sealed.ciphertext,
        totpSecretNonce: sealed.nonce,
        totpBackupCodeHashes: [],
      },
    });

    await this.recordSecurityAudit(user.id, 'auth.2fa.setup', meta);

    let qr: string | null = null;
    try {
      qr = await qrSvg(otpauthUri);
    } catch {
      qr = null;
    }

    return { secret, otpauthUri, qrSvg: qr };
  }

  async enableTotp(userId: string, code: string, meta: RequestMeta) {
    const user = await this.requireActiveUser(userId);
    if (user.totpEnabledAt) {
      throw conflict('Two-factor authentication is already enabled');
    }

    const secret = this.decryptUserSecret(user);
    if (!secret || !this.totp.verify(secret, code)) {
      throw totpInvalid();
    }

    const backupCodes = this.totp.generateBackupCodes();
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabledAt: new Date(),
        totpBackupCodeHashes: backupCodes.map((item) => this.totp.hashBackupCode(item)),
      },
    });

    await this.recordSecurityAudit(user.id, 'auth.2fa.enable', meta);

    return {
      backupCodes,
      user: serializeUser(updated),
    };
  }

  async disableTotp(userId: string, password: string, code: string, meta: RequestMeta) {
    const user = await this.requireActiveUser(userId);
    if (!user.totpEnabledAt) {
      throw conflict('Two-factor authentication is not enabled');
    }

    if (!(await this.passwords.verify(password, user.passwordHash))) {
      throw unauthorized('Invalid password', { password: 'Invalid password' });
    }

    if (this.verifyUserTotpOrBackup(user, code) === undefined) {
      throw totpInvalid();
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabledAt: null,
        totpSecretCiphertext: null,
        totpSecretNonce: null,
        totpBackupCodeHashes: [],
      },
    });

    await this.recordSecurityAudit(user.id, 'auth.2fa.disable', meta);

    return { user: serializeUser(updated) };
  }

  async logout(userId: string, sessionId: string | undefined, meta: SessionMeta): Promise<void> {
    if (sessionId) {
      await this.sessions.revoke(sessionId);
    }

    const organizationIds = await getUserOrganizationIds(this.prisma, userId);
    const organizationId = organizationIds[0];
    if (organizationId) {
      await writeAuditLog(this.prisma, {
        organizationId,
        userId,
        action: 'auth.logout',
        resourceType: 'session',
        resourceId: sessionId ?? null,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
  }

  async listSessions(userId: string, currentSessionId: string | undefined): Promise<PublicAuthSession[]> {
    const rows = await this.sessions.listActiveByUser(userId);
    const geoByIp = await lookupIpGeoMany(rows.map((row) => row.ipAddress));

    return rows.map((row) => {
      const parsed = parseUserAgent(row.userAgent);
      const geo = row.ipAddress ? (geoByIp.get(row.ipAddress) ?? null) : null;
      const session: PublicAuthSession = {
        id: row.id,
        current: Boolean(currentSessionId && row.id === currentSessionId),
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        label: parsed.label,
        browser: parsed.browser,
        os: parsed.os,
        isMobile: parsed.isMobile,
        locationLabel: geo?.locationLabel ?? null,
        city: geo?.city ?? null,
        region: geo?.region ?? null,
        country: geo?.country ?? null,
        countryCode: geo?.countryCode ?? null,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        isp: geo?.isp ?? null,
        locationAccuracy: geo?.accuracy ?? null,
      };
      return session;
    });
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string | undefined,
    meta: SessionMeta,
  ): Promise<{ revokedCurrent: boolean }> {
    const revoked = await this.sessions.revokeOwned(userId, sessionId);
    if (!revoked) {
      throw notFound('Session not found');
    }

    await this.recordSecurityAudit(userId, 'auth.session.revoke', meta, {
      sessionId,
      revokedCurrent: currentSessionId === sessionId,
    });

    return { revokedCurrent: Boolean(currentSessionId && currentSessionId === sessionId) };
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string | undefined,
    meta: SessionMeta,
  ): Promise<{ revokedCount: number }> {
    if (!currentSessionId) {
      throw unauthorized('Invalid session');
    }

    const revokedCount = await this.sessions.revokeOthers(userId, currentSessionId);
    await this.recordSecurityAudit(userId, 'auth.session.revoke_others', meta, {
      revokedCount,
      keptSessionId: currentSessionId,
    });

    return { revokedCount };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw unauthorized('Invalid session');
    }
    if (user.disabledAt) {
      throw forbidden('This account is disabled');
    }

    const memberships = await loadMemberships(this.prisma, userId);
    return {
      user: serializeUser(user),
      organizations: memberships.organizations,
      memberships: memberships.memberships,
    };
  }

  private async issueLoginSession(userId: string, meta: SessionMeta): Promise<LoginSessionResult> {
    const user = await this.requireActiveUser(userId);
    const session = await this.sessions.create(user.id, meta, meta.previousSessionToken);
    const memberships = await loadMemberships(this.prisma, user.id);

    const primaryOrganizationId = memberships.organizations[0]?.id;
    if (primaryOrganizationId) {
      await writeAuditLog(this.prisma, {
        organizationId: primaryOrganizationId,
        userId: user.id,
        action: 'auth.login',
        resourceType: 'session',
        resourceId: session.sessionId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }

    return {
      user: serializeUser(user),
      organizations: memberships.organizations,
      memberships: memberships.memberships,
      csrfToken: session.csrfToken,
      session,
    };
  }

  private async requireActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw unauthorized('Invalid session');
    }
    if (user.disabledAt) {
      throw forbidden('This account is disabled');
    }
    return user;
  }

  private decryptUserSecret(user: {
    totpSecretCiphertext: string | null;
    totpSecretNonce: string | null;
  }): string | null {
    if (!user.totpSecretCiphertext || !user.totpSecretNonce) {
      return null;
    }

    try {
      return decryptSecret(user.totpSecretCiphertext, user.totpSecretNonce, this.totpKey);
    } catch {
      return null;
    }
  }

  /**
   * Returns remaining backup hashes when verification succeeds.
   * The same array instance means a TOTP code was used; a new array means a backup code was consumed.
   */
  private verifyUserTotpOrBackup(
    user: {
      totpSecretCiphertext: string | null;
      totpSecretNonce: string | null;
      totpBackupCodeHashes: string[];
    },
    code: string,
  ): string[] | undefined {
    const secret = this.decryptUserSecret(user);
    if (secret && this.totp.verify(secret, code)) {
      return user.totpBackupCodeHashes;
    }

    return this.totp.consumeBackupCode(user.totpBackupCodeHashes, code);
  }

  private async recordSecurityAudit(
    userId: string,
    action: string,
    meta: RequestMeta,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    const organizationId = (await getUserOrganizationIds(this.prisma, userId))[0];
    if (!organizationId) {
      return;
    }

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action,
      resourceType: action.startsWith('auth.session.') ? 'session' : 'user',
      resourceId: typeof metadata?.sessionId === 'string' ? metadata.sessionId : userId,
      metadata,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }

  private async recordLoginFailure(
    userId: string,
    reason: string,
    meta: SessionMeta,
  ): Promise<void> {
    const organizationId = (await getUserOrganizationIds(this.prisma, userId))[0];
    if (!organizationId) {
      return;
    }

    await writeAuditLog(this.prisma, {
      organizationId,
      userId,
      action: 'auth.login',
      resourceType: 'session',
      result: 'failure',
      metadata: { reason },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  }
}

export function createAuthService(
  prisma: PrismaClient,
  sessions: SessionManager,
  nodeEnv: string,
  jwtSecret: string,
): AuthService {
  return new AuthService(prisma, sessions, nodeEnv, jwtSecret);
}

export type IssuedSession = SessionTokens;
