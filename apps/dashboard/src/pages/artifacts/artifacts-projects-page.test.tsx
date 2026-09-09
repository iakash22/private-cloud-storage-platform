import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { ArtifactsProjectsPage } from './artifacts-projects-page.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    permissions: [] as string[],
  },
  api: {
    listProjects: vi.fn(),
  },
}));

vi.mock('../../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../../lib/api.js', () => ({
  apiClient: api,
}));

describe('ArtifactsProjectsPage', () => {
  beforeEach(() => {
    authState.permissions = [PERMISSIONS.ARTIFACT_READ, PERMISSIONS.ARTIFACT_UPLOAD];
    api.listProjects.mockResolvedValue([
      {
        id: 'project-a',
        organizationId: 'org-a',
        name: 'mobile-app',
        slug: 'mobile-app',
        description: 'CI artifacts',
        retentionDays: 14,
        createdByUserId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  it('lists artifact projects', async () => {
    render(
      <MemoryRouter>
        <ArtifactsProjectsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('mobile-app')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('hides create actions from readers', async () => {
    authState.permissions = [PERMISSIONS.ARTIFACT_READ];
    render(
      <MemoryRouter>
        <ArtifactsProjectsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('mobile-app')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Create project' })).not.toBeInTheDocument();
  });
});
