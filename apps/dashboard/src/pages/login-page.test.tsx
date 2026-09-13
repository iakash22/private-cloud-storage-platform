import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGatePage } from './auth-gate-page.js';

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
  loading: false,
  error: null as string | null,
  login: vi.fn(),
  verifyTotp: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

describe('AuthGatePage', () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    authState.error = null;
    authState.login.mockReset();
    authState.verifyTotp.mockReset();
  });

  it('renders sign in and keeps invalid emails on the field', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthGatePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'VaultStack' })).toBeInTheDocument();
    expect(document.querySelector('[data-auth-screen]')).toHaveClass('md:overflow-hidden');
    expect(document.querySelector('.vs-auth-liquid-glass')).toBeTruthy();
    expect(document.querySelector('.vs-auth-liquid-glass__visual')).toBeTruthy();
    expect(document.querySelector('.vs-auth-liquid-glass__shine')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument();
    expect(screen.queryByText(/checking existing session/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });

  it('shows bootstrap loader while session is resolving', () => {
    authState.loading = true;

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthGatePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Preparing VaultStack')).toBeInTheDocument();
    expect(screen.getByText('Getting things ready…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.queryByText(/checking existing session/i)).not.toBeInTheDocument();
  });
});
