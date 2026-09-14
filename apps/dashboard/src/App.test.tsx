import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

vi.mock('./context/auth-context.js', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({
    user: null,
    organizations: [],
    memberships: [],
    activeOrganizationId: null,
    permissions: [],
    loading: false,
    login: vi.fn(),
    verifyTotp: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    selectOrganization: vi.fn(),
  }),
}));

describe('App routing', () => {
  it('renders the login page by default for anonymous users', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'VaultStack' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
