import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { UsersPage } from './users-page.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    activeOrganizationId: 'org-a',
    permissions: [] as string[],
    user: { id: 'user-admin', email: 'admin@example.com', name: 'Admin' },
  },
  api: {
    listUsers: vi.fn(),
    listRoles: vi.fn(),
  },
}));

vi.mock('../../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../../lib/api.js', () => ({
  apiClient: api,
}));

describe('UsersPage', () => {
  beforeEach(() => {
    authState.permissions = [PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE];
    api.listUsers.mockResolvedValue([
      {
        id: 'user-1',
        email: 'member@example.com',
        name: 'Member',
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    api.listRoles.mockResolvedValue([
      {
        id: 'role-1',
        organizationId: 'org-a',
        name: 'VIEWER',
        description: 'Read-only',
        isSystem: true,
        permissions: [PERMISSIONS.STORAGE_READ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  it('lists organization users', async () => {
    render(<UsersPage />);

    expect(await screen.findByText('member@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite user' })).toBeInTheDocument();
  });

  it('hides invite actions from read-only operators', async () => {
    authState.permissions = [PERMISSIONS.USERS_READ];
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText('member@example.com')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Invite user' })).not.toBeInTheDocument();
  });
});
