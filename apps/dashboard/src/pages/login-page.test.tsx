import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login-page.js';

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    login: vi.fn(),
    verifyTotp: vi.fn(),
    register: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders sign in and keeps invalid emails on the field', async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'VaultStack' })).toBeInTheDocument();
    expect(document.querySelector('[data-auth-screen]')).toHaveClass('md:overflow-hidden');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });
});
