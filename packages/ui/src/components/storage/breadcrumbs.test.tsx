import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './breadcrumbs.js';

describe('Breadcrumbs', () => {
  it('navigates when a parent segment is clicked', () => {
    const onNavigate = vi.fn();

    render(<Breadcrumbs prefix="docs/reports/" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'docs' }));
    expect(onNavigate).toHaveBeenCalledWith('docs/');
  });
});
