import { describe, expect, it } from 'vitest';
import { loginDetectedEmail, welcomeEmail } from './messages.js';

describe('email templates', () => {
  it('renders welcome email with VaultStack branding', () => {
    const message = welcomeEmail({
      to: 'user@example.com',
      recipientName: 'Alex',
      organizationName: 'Acme Storage',
      dashboardUrl: 'https://vault.example.com',
    });

    expect(message.subject).toContain('Acme Storage');
    expect(message.html).toContain('VaultStack');
    expect(message.html).toContain('#2563eb');
    expect(message.text).toContain('Alex');
  });

  it('renders login detected email with session details', () => {
    const message = loginDetectedEmail({
      to: 'user@example.com',
      recipientName: 'Alex',
      dashboardUrl: 'https://vault.example.com',
      isNewDevice: true,
      session: {
        occurredAt: '2026-09-14T00:00:00.000Z',
        ipAddress: '203.0.113.10',
        browser: 'Chrome',
        os: 'Windows',
        locationLabel: 'Berlin, DE',
      },
    });

    expect(message.templateId).toBe('login_detected');
    expect(message.html).toContain('203.0.113.10');
    expect(message.html).toContain('Berlin, DE');
  });
});
