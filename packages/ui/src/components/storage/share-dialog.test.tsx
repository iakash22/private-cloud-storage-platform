import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareDialog } from './share-dialog.js';

HTMLDialogElement.prototype.showModal = function showModal() {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close() {
  this.removeAttribute('open');
};

describe('ShareDialog', () => {
  it('creates a public link with expiration, permissions, and copy after create', () => {
    const onCreate = vi.fn();

    const { rerender } = render(
      <ShareDialog
        open
        objectName="report.pdf"
        onOpenChange={() => undefined}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByLabelText('Visibility')).toHaveValue('PUBLIC_LINK');
    fireEvent.click(screen.getByLabelText('Viewer permission'));
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'PUBLIC_LINK',
        allowView: false,
        allowDownload: true,
      }),
    );

    rerender(
      <ShareDialog
        open
        objectName="report.pdf"
        createdUrl="http://localhost:5173/s/vs_sh_exampletoken"
        onOpenChange={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Share link')).toHaveValue(
      'http://localhost:5173/s/vs_sh_exampletoken',
    );
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
