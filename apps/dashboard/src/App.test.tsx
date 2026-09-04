import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('Dashboard App', () => {
  it('renders the VaultStack heading', () => {
    render(<App />);
    expect(screen.getByText('VaultStack')).toBeInTheDocument();
  });
});
