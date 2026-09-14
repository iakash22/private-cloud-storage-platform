export type EmailTemplateId =
  | 'welcome'
  | 'login_detected'
  | 'login_failed'
  | 'session_revoked'
  | 'session_revoked_others'
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'user_invited'
  | 'team_added'
  | 'security_alert'
  | 'account_disabled'
  | 'folder_operation_completed'
  | 'folder_operation_failed'
  | 'backup_job_completed'
  | 'backup_job_failed';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  templateId: EmailTemplateId;
  tags?: { name: string; value: string }[];
}

export interface EmailProvider {
  send(message: OutboundEmail): Promise<{ id: string | null }>;
}

export interface EmailLayoutContext {
  dashboardUrl: string;
  preheader?: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export interface SessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  locationLabel?: string | null;
  occurredAt: string;
}

export interface ActorContext {
  name?: string | null;
  email?: string | null;
}
