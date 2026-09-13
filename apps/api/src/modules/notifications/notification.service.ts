import {
  accountDisabledEmail,
  backupJobCompletedEmail,
  backupJobFailedEmail,
  createEmailProvider,
  folderOperationCompletedEmail,
  folderOperationFailedEmail,
  loginDetectedEmail,
  loginFailedEmail,
  securityAlertEmail,
  sessionRevokedEmail,
  sessionRevokedOthersEmail,
  teamAddedEmail,
  twoFactorDisabledEmail,
  twoFactorEnabledEmail,
  userInvitedEmail,
  welcomeEmail,
  type EmailProvider,
  type OutboundEmail,
  type SessionContext,
} from '@vaultstack/email';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Logger } from '@vaultstack/logger';
import type { RequestMeta } from '@vaultstack/types';
import { lookupIpGeoMany } from '../auth/services/ip-geo.service.js';
import { parseUserAgent } from '../auth/services/user-agent.js';

export type NotificationEnqueue = (message: OutboundEmail) => Promise<void>;

export class NotificationService {
  private readonly provider: EmailProvider;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: EnvConfig,
    private readonly logger: Logger,
    private readonly enqueue: NotificationEnqueue,
  ) {
    this.enabled = config.EMAIL_ENABLED;
    this.provider = createEmailProvider({
      apiKey: config.RESEND_API_KEY,
      from: config.EMAIL_FROM,
    });
  }

  async sendNow(message: OutboundEmail): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const result = await this.provider.send(message);
      this.logger.info(
        { event: 'email.sent', templateId: message.templateId, messageId: result.id },
        'Email sent',
      );
    } catch (error: unknown) {
      this.logger.warn(
        { event: 'email.failed', templateId: message.templateId, err: error },
        'Email delivery failed',
      );
    }
  }

  queue(message: OutboundEmail): void {
    if (!this.enabled) {
      return;
    }

    void this.enqueue(message).catch((error: unknown) => {
      this.logger.warn(
        { event: 'email.enqueue_failed', templateId: message.templateId, err: error },
        'Failed to enqueue email',
      );
    });
  }

  notifyWelcome(input: {
    to: string;
    recipientName: string;
    organizationName: string;
  }): void {
    this.queue(
      welcomeEmail({
        ...input,
        dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
      }),
    );
  }

  notifyLoginDetected(input: {
    to: string;
    recipientName: string;
    meta: RequestMeta;
    isNewDevice: boolean;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        loginDetectedEmail({
          to: input.to,
          recipientName: input.recipientName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
          isNewDevice: input.isNewDevice,
        }),
      );
    });
  }

  notifyLoginFailed(input: {
    to: string;
    recipientName: string;
    reason: string;
    meta: RequestMeta;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        loginFailedEmail({
          to: input.to,
          recipientName: input.recipientName,
          reason: input.reason,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
        }),
      );
    });
  }

  notifyTwoFactorEnabled(input: {
    to: string;
    recipientName: string;
    meta: RequestMeta;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        twoFactorEnabledEmail({
          to: input.to,
          recipientName: input.recipientName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
        }),
      );
    });
  }

  notifyTwoFactorDisabled(input: {
    to: string;
    recipientName: string;
    meta: RequestMeta;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        twoFactorDisabledEmail({
          to: input.to,
          recipientName: input.recipientName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
        }),
      );
    });
  }

  notifySessionRevoked(input: {
    to: string;
    recipientName: string;
    meta: RequestMeta;
    revokedBySelf: boolean;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        sessionRevokedEmail({
          to: input.to,
          recipientName: input.recipientName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
          revokedBySelf: input.revokedBySelf,
        }),
      );
    });
  }

  notifySessionRevokedOthers(input: {
    to: string;
    recipientName: string;
    meta: RequestMeta;
    revokedCount: number;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        sessionRevokedOthersEmail({
          to: input.to,
          recipientName: input.recipientName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          revokedCount: input.revokedCount,
          session,
        }),
      );
    });
  }

  notifyUserInvited(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    roleName: string;
    actorUserId: string;
  }): void {
    void this.loadActor(input.actorUserId).then((actor) => {
      this.queue(
        userInvitedEmail({
          to: input.to,
          recipientName: input.recipientName,
          organizationName: input.organizationName,
          roleName: input.roleName,
          actor,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
        }),
      );
    });
  }

  notifySecurityAlert(input: {
    to: string;
    recipientName: string;
    headline: string;
    detail: string;
    meta: RequestMeta;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        securityAlertEmail({
          to: input.to,
          recipientName: input.recipientName,
          headline: input.headline,
          detail: input.detail,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
        }),
      );
    });
  }

  notifyAccountDisabled(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    meta: RequestMeta;
  }): void {
    void this.buildSessionContext(input.meta).then((session) => {
      this.queue(
        accountDisabledEmail({
          to: input.to,
          recipientName: input.recipientName,
          organizationName: input.organizationName,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
          session,
        }),
      );
    });
  }

  notifyFolderOperationCompleted(input: {
    to: string;
    recipientName: string;
    operation: string;
    sourcePrefix: string;
    processedObjects: number;
  }): void {
    this.queue(
      folderOperationCompletedEmail({
        ...input,
        dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
      }),
    );
  }

  notifyFolderOperationFailed(input: {
    to: string;
    recipientName: string;
    operation: string;
    sourcePrefix: string;
    error: string;
  }): void {
    this.queue(
      folderOperationFailedEmail({
        ...input,
        dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
      }),
    );
  }

  notifyBackupJobCompleted(input: {
    to: string;
    recipientName: string;
    jobName: string;
  }): void {
    this.queue(
      backupJobCompletedEmail({
        ...input,
        dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
      }),
    );
  }

  notifyBackupJobFailed(input: {
    to: string;
    recipientName: string;
    jobName: string;
    error: string;
  }): void {
    this.queue(
      backupJobFailedEmail({
        ...input,
        dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
      }),
    );
  }

  notifyTeamAdded(input: {
    to: string;
    recipientName: string;
    organizationName: string;
    teamName: string;
    actorUserId: string;
  }): void {
    void this.loadActor(input.actorUserId).then((actor) => {
      this.queue(
        teamAddedEmail({
          to: input.to,
          recipientName: input.recipientName,
          organizationName: input.organizationName,
          teamName: input.teamName,
          actor,
          dashboardUrl: this.config.DASHBOARD_PUBLIC_URL,
        }),
      );
    });
  }

  async isNewDeviceLogin(userId: string, meta: RequestMeta): Promise<boolean> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { ipAddress: true, userAgent: true },
    });

    if (rows.length === 0) {
      return true;
    }

    const ip = meta.ipAddress?.trim() ?? '';
    const ua = meta.userAgent?.trim() ?? '';
    return !rows.some((row) => (row.ipAddress ?? '') === ip && (row.userAgent ?? '') === ua);
  }

  private async buildSessionContext(meta: RequestMeta): Promise<SessionContext> {
    const parsed = parseUserAgent(meta.userAgent);
    const geoByIp = meta.ipAddress
      ? await lookupIpGeoMany([meta.ipAddress])
      : new Map<string, never>();
    const geo = meta.ipAddress ? (geoByIp.get(meta.ipAddress) ?? null) : null;

    return {
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
      browser: parsed.browser,
      os: parsed.os,
      locationLabel: geo?.locationLabel ?? null,
      occurredAt: new Date().toISOString(),
    };
  }

  private async loadActor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return { name: user?.name ?? null, email: user?.email ?? null };
  }
}
