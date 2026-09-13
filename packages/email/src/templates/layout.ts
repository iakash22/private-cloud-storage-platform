import { EMAIL_BRAND, brandLogoSvg } from '../brand.js';
import type { EmailLayoutContext } from '../types.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderEmailLayout(context: EmailLayoutContext): { html: string; text: string } {
  const title = escapeHtml(context.title);
  const preheader = escapeHtml(context.preheader ?? context.title);
  const footerNote = escapeHtml(
    context.footerNote ??
      'You received this message because notifications are enabled for your VaultStack account.',
  );
  const dashboardUrl = escapeHtml(context.dashboardUrl);
  const ctaBlock =
    context.ctaLabel && context.ctaUrl
      ? `<tr>
          <td style="padding: 0 32px 32px;">
            <a href="${escapeHtml(context.ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg, ${EMAIL_BRAND.sky}, ${EMAIL_BRAND.blue});color:#ffffff;font-family:${EMAIL_BRAND.fontSans};font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px;">
              ${escapeHtml(context.ctaLabel)}
            </a>
          </td>
        </tr>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="color-scheme" content="light"/>
    <title>${title}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700&family=Source+Sans+3:wght@400;600&display=swap');
    </style>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_BRAND.paper};color:${EMAIL_BRAND.ink};font-family:${EMAIL_BRAND.fontSans};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND.paper};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid ${EMAIL_BRAND.line};border-radius:18px;overflow:hidden;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 32px 12px;background:linear-gradient(180deg, ${EMAIL_BRAND.shade100}, #ffffff);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="56">${brandLogoSvg(48)}</td>
                    <td style="padding-left:12px;">
                      <div style="font-family:${EMAIL_BRAND.fontDisplay};font-size:22px;font-weight:700;color:${EMAIL_BRAND.ink};">${EMAIL_BRAND.productName}</div>
                      <div style="font-size:13px;color:${EMAIL_BRAND.muted};margin-top:2px;">${EMAIL_BRAND.tagline}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;font-family:${EMAIL_BRAND.fontDisplay};font-size:24px;line-height:1.25;font-weight:700;color:${EMAIL_BRAND.ink};">
                ${title}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;font-size:15px;line-height:1.65;color:${EMAIL_BRAND.shade800};">
                ${context.bodyHtml}
              </td>
            </tr>
            ${ctaBlock}
            <tr>
              <td style="padding:0 32px 28px;font-size:13px;line-height:1.6;color:${EMAIL_BRAND.muted};border-top:1px solid ${EMAIL_BRAND.line};">
                <p style="margin:20px 0 8px;">${footerNote}</p>
                <p style="margin:0;">
                  <a href="${dashboardUrl}" style="color:${EMAIL_BRAND.blue};text-decoration:none;">Open dashboard</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    context.title,
    '',
    stripHtml(context.bodyHtml),
    context.ctaLabel && context.ctaUrl ? `\n${context.ctaLabel}: ${context.ctaUrl}` : '',
    `\nOpen dashboard: ${context.dashboardUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function detailTable(rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .map(
      (row) => `<tr>
        <td style="padding:8px 0;color:${EMAIL_BRAND.muted};width:120px;vertical-align:top;">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;color:${EMAIL_BRAND.ink};font-weight:600;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join('');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;background:${EMAIL_BRAND.shade100};border:1px solid ${EMAIL_BRAND.line};border-radius:12px;padding:4px 16px;">${cells}</table>`;
}
