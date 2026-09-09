import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { TwoFactorSettings } from './two-factor-settings.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      disabled: false,
      twoFactorEnabled: false,
      createdAt: '',
      updatedAt: '',
    },
    refresh: vi.fn(),
  },
  api: {
    setupTotp: vi.fn(),
    enableTotp: vi.fn(),
    disableTotp: vi.fn(),
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/api.js', () => ({
  apiClient: api,
}));

describe('TwoFactorSettings', () => {
  beforeEach(() => {
    authState.user.twoFactorEnabled = false;
    api.setupTotp.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/VaultStack:owner@example.com?secret=JBSWY3DPEHPK3PXP',
      qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    api.enableTotp.mockResolvedValue({
      backupCodes: ['AAAAA-BBBBB'],
      user: { ...authState.user, twoFactorEnabled: true },
    });
  });

  it('lets the current user start authenticator enrollment', async () => {
    render(<TwoFactorSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Manual setup key')).toHaveValue('JBSWY3DPEHPK3PXP');
    });
    expect(screen.getByAltText('Authenticator QR code')).toBeInTheDocument();
  });
});
