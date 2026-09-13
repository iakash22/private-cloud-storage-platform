import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { ActiveSessionsSettings } from './active-sessions-settings.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    logout: vi.fn(),
  },
  api: {
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/api.js', () => ({
  apiClient: api,
}));

describe('ActiveSessionsSettings', () => {
  beforeEach(() => {
    api.listSessions.mockResolvedValue([
      {
        id: 'current',
        current: true,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 Chrome/120',
        label: 'Chrome on Windows',
        browser: 'Chrome 120',
        os: 'Windows 10 / 11',
        isMobile: false,
        locationLabel: 'Bengaluru, Karnataka, IN',
        city: 'Bengaluru',
        region: 'Karnataka',
        country: 'India',
        countryCode: 'IN',
        latitude: 12.9716,
        longitude: 77.5946,
        isp: 'Example ISP',
        locationAccuracy: 'ip-approximate',
      },
      {
        id: 'other',
        current: false,
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        ipAddress: '198.51.100.20',
        userAgent: 'Mozilla/5.0 Firefox/121',
        label: 'Firefox on macOS',
        browser: 'Firefox 121',
        os: 'macOS',
        isMobile: false,
        locationLabel: 'San Francisco, California, US',
        city: 'San Francisco',
        region: 'California',
        country: 'United States',
        countryCode: 'US',
        latitude: 37.7749,
        longitude: -122.4194,
        isp: 'Other ISP',
        locationAccuracy: 'ip-approximate',
      },
    ]);
    api.revokeSession.mockResolvedValue({ revokedCurrent: false });
    api.revokeOtherSessions.mockResolvedValue({ revokedCount: 1 });
  });

  it('lists server sessions with IP and location', async () => {
    render(<ActiveSessionsSettings />);

    await waitFor(() => {
      expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    });
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.getByText('203.0.113.10')).toBeInTheDocument();
    expect(screen.getByText(/Bengaluru/)).toBeInTheDocument();
    expect(screen.getByText('Firefox on macOS')).toBeInTheDocument();
  });

  it('revokes another session after confirm', async () => {
    render(<ActiveSessionsSettings />);
    await waitFor(() => {
      expect(screen.getByText('Firefox on macOS')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke session' }));

    await waitFor(() => {
      expect(api.revokeSession).toHaveBeenCalledWith('other');
    });
  });
});
