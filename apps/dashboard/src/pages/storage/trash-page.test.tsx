import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { TrashPage } from './trash-page.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    permissions: [] as string[],
  },
  api: {
    listObjectVersions: vi.fn(),
    restoreObjectVersion: vi.fn(),
  },
}));

vi.mock('../../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../../lib/api.js', () => ({
  apiClient: api,
}));

vi.mock('../../lib/storage-preferences.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/storage-preferences.js')>(
    '../../lib/storage-preferences.js',
  );
  return {
    ...actual,
    getTrashItems: () => [
      {
        id: 'object-1',
        bucketId: 'bucket-a',
        key: 'reports/q1.pdf',
        name: 'q1.pdf',
        size: 1024,
        deletedAt: new Date().toISOString(),
      },
    ],
  };
});

describe('TrashPage', () => {
  beforeEach(() => {
    authState.permissions = [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD];
  });

  it('enables restore for recently deleted objects', async () => {
    render(<TrashPage />);

    await waitFor(() => {
      expect(screen.getByText('q1.pdf')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Restore q1.pdf' })).toBeEnabled();
  });
});
