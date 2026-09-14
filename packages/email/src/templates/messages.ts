import type { ActorContext, OutboundEmail, SessionContext } from '../types.js';
import { detailTable, renderEmailLayout } from './layout.js';

function sessionRows(session: SessionContext): { label: string; value: string }[] {
  return [
    { label: 'When', value: session.occurredAt },
    ...(session.locationLabel ? [{ label: 'Location', value: session.locationLabel }] : []),
    ...(session.ipAddress ? [{ label: 'IP address', value: session.ipAddress }] : []),
    ...(session.browser ? [{ label: 'Browser', value: session.browser }] : []),
    ...(session.os ? [{ label: 'OS', value: session.os }] : []),
    ...(session.userAgent ? [{ label: 'Device', value: session.userAgent }] : []),
  ];
}

function actorLine(actor?: ActorContext): string {
  if (!actor?.name && !actor?.email) {
    return 'An administrator';
  }
  if (actor.name && actor.email) {
    return `${actor.name} (${actor.email})`;
  }
  return actor.name ?? actor.email ?? 'An administrator';
}

export function welcomeEmail(input: {
  to: string;
  recipientName: string;
  organizationName: string;
  dashboardUrl: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: `Welcome to ${input.organizationName}`,
    preheader: 'Your VaultStack organization is ready.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Your VaultStack organization <strong>${escapeHtmlInline(input.organizationName)}</strong> is ready. You can manage storage, access, backups, and infrastructure from one dashboard.</p>
      <p>If you did not create this account, contact your administrator immediately.</p>`,
    ctaLabel: 'Open VaultStack',
    ctaUrl: input.dashboardUrl,
  });

  return {
    to: input.to,
    subject: `Welcome to VaultStack — ${input.organizationName}`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'welcome',
    tags: [{ name: 'category', value: 'welcome' }],
  };
}

export function loginDetectedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  session: SessionContext;
  isNewDevice: boolean;
}): OutboundEmail {
  const title = input.isNewDevice ? 'New sign-in detected' : 'Sign-in to your account';
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title,
    preheader: 'A new VaultStack session was created.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>We detected a ${input.isNewDevice ? 'new' : 'recent'} sign-in to your VaultStack account.</p>
      ${detailTable(sessionRows(input.session))}
      <p>If this was not you, revoke the session from Settings → Active sessions and enable two-factor authentication.</p>`,
    ctaLabel: 'Review active sessions',
    ctaUrl: `${input.dashboardUrl}/settings/sessions`,
  });

  return {
    to: input.to,
    subject: `${title} — VaultStack`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'login_detected',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function loginFailedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  reason: string;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Failed sign-in attempt',
    preheader: 'Someone tried to sign in to your VaultStack account.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>We blocked a sign-in attempt on your VaultStack account.</p>
      ${detailTable([
        { label: 'Reason', value: input.reason },
        ...sessionRows(input.session),
      ])}
      <p>If this was not you, change your password and review active sessions.</p>`,
    ctaLabel: 'Secure your account',
    ctaUrl: `${input.dashboardUrl}/settings/sessions`,
  });

  return {
    to: input.to,
    subject: 'Failed sign-in attempt — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'login_failed',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function sessionRevokedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  session: SessionContext;
  revokedBySelf: boolean;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: input.revokedBySelf ? 'Session signed out' : 'Session revoked',
    preheader: 'A VaultStack session was terminated.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>${input.revokedBySelf ? 'You signed out of a VaultStack session.' : 'An active VaultStack session was revoked from your account.'}</p>
      ${detailTable(sessionRows(input.session))}`,
    ctaLabel: 'View active sessions',
    ctaUrl: `${input.dashboardUrl}/settings/sessions`,
  });

  return {
    to: input.to,
    subject: `${input.revokedBySelf ? 'Session signed out' : 'Session revoked'} — VaultStack`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'session_revoked',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function sessionRevokedOthersEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  revokedCount: number;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Other sessions signed out',
    preheader: 'VaultStack signed out sessions on other devices.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>You signed out <strong>${input.revokedCount}</strong> other active session${input.revokedCount === 1 ? '' : 's'} from your account.</p>
      ${detailTable(sessionRows(input.session))}`,
    ctaLabel: 'Review active sessions',
    ctaUrl: `${input.dashboardUrl}/settings/sessions`,
  });

  return {
    to: input.to,
    subject: 'Other sessions signed out — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'session_revoked_others',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function twoFactorEnabledEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Two-factor authentication enabled',
    preheader: 'Your VaultStack account is now protected with 2FA.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Two-factor authentication was enabled on your VaultStack account.</p>
      ${detailTable(sessionRows(input.session))}
      <p>Store your backup codes in a safe place. You will need them if you lose access to your authenticator app.</p>`,
    ctaLabel: 'Open security settings',
    ctaUrl: `${input.dashboardUrl}/settings/security`,
  });

  return {
    to: input.to,
    subject: 'Two-factor authentication enabled — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'two_factor_enabled',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function twoFactorDisabledEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Two-factor authentication disabled',
    preheader: '2FA was removed from your VaultStack account.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Two-factor authentication was disabled on your VaultStack account.</p>
      ${detailTable(sessionRows(input.session))}
      <p>If you did not make this change, sign in immediately and re-enable 2FA.</p>`,
    ctaLabel: 'Secure your account',
    ctaUrl: `${input.dashboardUrl}/settings/security`,
  });

  return {
    to: input.to,
    subject: 'Two-factor authentication disabled — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'two_factor_disabled',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function userInvitedEmail(input: {
  to: string;
  recipientName: string;
  organizationName: string;
  roleName: string;
  actor: ActorContext;
  dashboardUrl: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: `You were added to ${input.organizationName}`,
    preheader: 'You now have access to a VaultStack organization.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>${escapeHtmlInline(actorLine(input.actor))} added you to <strong>${escapeHtmlInline(input.organizationName)}</strong> on VaultStack.</p>
      ${detailTable([
        { label: 'Organization', value: input.organizationName },
        { label: 'Role', value: input.roleName },
      ])}
      <p>Sign in with this email address to access shared storage, teams, and organization settings.</p>`,
    ctaLabel: 'Open VaultStack',
    ctaUrl: input.dashboardUrl,
  });

  return {
    to: input.to,
    subject: `You were added to ${input.organizationName} — VaultStack`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'user_invited',
    tags: [{ name: 'category', value: 'invitation' }],
  };
}

export function teamAddedEmail(input: {
  to: string;
  recipientName: string;
  organizationName: string;
  teamName: string;
  actor: ActorContext;
  dashboardUrl: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: `Added to team ${input.teamName}`,
    preheader: 'You were added to a VaultStack team.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>${escapeHtmlInline(actorLine(input.actor))} added you to the <strong>${escapeHtmlInline(input.teamName)}</strong> team in ${escapeHtmlInline(input.organizationName)}.</p>
      ${detailTable([
        { label: 'Organization', value: input.organizationName },
        { label: 'Team', value: input.teamName },
      ])}
      <p>Team membership may grant access to shared folders and collaboration features.</p>`,
    ctaLabel: 'View teams',
    ctaUrl: `${input.dashboardUrl}/access/teams`,
  });

  return {
    to: input.to,
    subject: `Added to ${input.teamName} — VaultStack`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'team_added',
    tags: [{ name: 'category', value: 'invitation' }],
  };
}

export function accountDisabledEmail(input: {
  to: string;
  recipientName: string;
  organizationName: string;
  dashboardUrl: string;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Account access disabled',
    preheader: 'Your VaultStack account was disabled.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Your VaultStack access to <strong>${escapeHtmlInline(input.organizationName)}</strong> was disabled by an administrator. Active sessions were signed out.</p>
      ${detailTable(sessionRows(input.session))}
      <p>If you believe this was a mistake, contact your organization administrator.</p>`,
    ctaLabel: 'Contact support',
    ctaUrl: input.dashboardUrl,
  });

  return {
    to: input.to,
    subject: 'Account access disabled — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'account_disabled',
    tags: [{ name: 'category', value: 'security' }],
  };
}

export function folderOperationCompletedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  operation: string;
  sourcePrefix: string;
  processedObjects: number;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Folder operation completed',
    preheader: `Your ${input.operation.toLowerCase()} operation finished.`,
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Your folder <strong>${escapeHtmlInline(input.operation.toLowerCase())}</strong> operation completed successfully.</p>
      ${detailTable([
        { label: 'Operation', value: input.operation },
        { label: 'Folder', value: input.sourcePrefix },
        { label: 'Processed', value: String(input.processedObjects) },
      ])}`,
    ctaLabel: 'Open storage',
    ctaUrl: `${input.dashboardUrl}/storage/files`,
  });

  return {
    to: input.to,
    subject: 'Folder operation completed — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'folder_operation_completed',
    tags: [{ name: 'category', value: 'storage' }],
  };
}

export function folderOperationFailedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  operation: string;
  sourcePrefix: string;
  error: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Folder operation failed',
    preheader: 'A folder operation did not complete.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Your folder operation could not be completed.</p>
      ${detailTable([
        { label: 'Operation', value: input.operation },
        { label: 'Folder', value: input.sourcePrefix },
        { label: 'Error', value: input.error },
      ])}`,
    ctaLabel: 'Review storage',
    ctaUrl: `${input.dashboardUrl}/storage/files`,
  });

  return {
    to: input.to,
    subject: 'Folder operation failed — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'folder_operation_failed',
    tags: [{ name: 'category', value: 'storage' }],
  };
}

export function backupJobCompletedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  jobName: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Backup completed',
    preheader: 'A VaultStack backup job finished successfully.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Backup job <strong>${escapeHtmlInline(input.jobName)}</strong> completed successfully.</p>`,
    ctaLabel: 'View backups',
    ctaUrl: `${input.dashboardUrl}/backups/jobs`,
  });

  return {
    to: input.to,
    subject: 'Backup completed — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'backup_job_completed',
    tags: [{ name: 'category', value: 'backup' }],
  };
}

export function backupJobFailedEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  jobName: string;
  error: string;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: 'Backup failed',
    preheader: 'A VaultStack backup job did not complete.',
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>Backup job <strong>${escapeHtmlInline(input.jobName)}</strong> failed.</p>
      ${detailTable([{ label: 'Error', value: input.error }])}`,
    ctaLabel: 'Review backups',
    ctaUrl: `${input.dashboardUrl}/backups/jobs`,
  });

  return {
    to: input.to,
    subject: 'Backup failed — VaultStack',
    html: rendered.html,
    text: rendered.text,
    templateId: 'backup_job_failed',
    tags: [{ name: 'category', value: 'backup' }],
  };
}

export function securityAlertEmail(input: {
  to: string;
  recipientName: string;
  dashboardUrl: string;
  headline: string;
  detail: string;
  session: SessionContext;
}): OutboundEmail {
  const rendered = renderEmailLayout({
    dashboardUrl: input.dashboardUrl,
    title: input.headline,
    preheader: input.detail,
    bodyHtml: `<p>Hi ${escapeHtmlInline(input.recipientName)},</p>
      <p>${escapeHtmlInline(input.detail)}</p>
      ${detailTable(sessionRows(input.session))}`,
    ctaLabel: 'Review security settings',
    ctaUrl: `${input.dashboardUrl}/settings/security`,
  });

  return {
    to: input.to,
    subject: `${input.headline} — VaultStack`,
    html: rendered.html,
    text: rendered.text,
    templateId: 'security_alert',
    tags: [{ name: 'category', value: 'security' }],
  };
}

function escapeHtmlInline(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
