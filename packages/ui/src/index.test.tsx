import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './components/button.js';

describe('@vaultstack/ui', () => {
  it('renders a button', () => {
    render(<Button>VaultStack</Button>);
    expect(screen.getByRole('button', { name: 'VaultStack' })).toBeInTheDocument();
  });
});
