export { EMAIL_BRAND, brandLogoSvg } from './brand.js';
export { createEmailProvider, NoopEmailProvider, ResendEmailProvider } from './provider.js';
export type {
  ActorContext,
  EmailLayoutContext,
  EmailProvider,
  EmailTemplateId,
  OutboundEmail,
  SessionContext,
} from './types.js';
export {
  accountDisabledEmail,
  backupJobCompletedEmail,
  backupJobFailedEmail,
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
} from './templates/messages.js';
export { detailTable, renderEmailLayout } from './templates/layout.js';
