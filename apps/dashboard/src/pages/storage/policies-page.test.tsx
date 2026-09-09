import { render, screen } from '@testing-library/react';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { PERMISSIONS, STORAGE_LIFECYCLE_ACTIONS } from '@vaultstack/types';
import { PoliciesPage } from './policies-page.js';

const { api, authState, bucketsState } = vi.hoisted(() => ({
  authState: {
    permissions: [] as string[],
  },
  bucketsState: {
    buckets: [] as { id: string; name: string }[],
  },
  api: {
    listPolicies: vi.fn(),
  },
}));

vi.mock('../../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../../hooks/use-storage.js', () => ({
  useBuckets: () => bucketsState,
}));

vi.mock('../../lib/api.js', () => ({
  apiClient: api,
}));

describe('PoliciesPage', () => {
  beforeEach(() => {
    authState.permissions = [PERMISSIONS.STORAGE_READ, PERMISSIONS.STORAGE_UPLOAD];
    bucketsState.buckets = [{ id: 'bucket-a', name: 'documents' }];
    api.listPolicies.mockResolvedValue([
      {
        id: 'policy-1',
        organizationId: 'org-a',
        bucketId: 'bucket-a',
        name: 'Expire after 30 days',
        kind: 'LIFECYCLE',
        effect: 'ALLOW',
        enabled: true,
        actions: [],
        keyPrefix: null,
        days: 30,
        lifecycleAction: STORAGE_LIFECYCLE_ACTIONS.EXPIRE_CURRENT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  it('lists lifecycle policies', async () => {
    render(<PoliciesPage />);

    expect(await screen.findByText('Expire after 30 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create policy' })).toBeInTheDocument();
  });
});
