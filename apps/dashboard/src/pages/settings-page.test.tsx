import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { SettingsPage } from './settings-page.js';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: {
      id: 'user-1',
      email: 'akashk61530@gmail.com',
      name: 'Akash',
      disabled: false,
      twoFactorEnabled: false,
      createdAt: '',
      updatedAt: '',
    },
    organizations: [
      {
        id: 'org-a',
        name: 'Acme',
        slug: 'acme',
        createdAt: '',
        updatedAt: '',
      },
    ],
    memberships: [{ organizationId: 'org-a', roles: ['SUPER_ADMIN'], permissions: [] as string[] }],
    activeOrganizationId: 'org-a',
    permissions: [] as string[],
    refresh: vi.fn(),
    selectOrganization: vi.fn(),
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/api.js', () => ({
  apiClient: {
    setupTotp: vi.fn(),
    enableTotp: vi.fn(),
    disableTotp: vi.fn(),
    updateOrganization: vi.fn(),
    createOrganization: vi.fn(),
    updateUser: vi.fn(),
  },
}));

describe('SettingsPage', () => {
  it('shows organization and profile forms for an administrator', () => {
    authState.permissions = [PERMISSIONS.USERS_MANAGE];

    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
    expect(screen.getByDisplayValue('acme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save organization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument();
  });
});
