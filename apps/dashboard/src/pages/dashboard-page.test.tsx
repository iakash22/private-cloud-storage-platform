import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, beforeEach, it, vi } from 'vitest';
import { PERMISSIONS } from '@vaultstack/types';
import { DashboardPage } from './dashboard-page.js';

const { api, authState } = vi.hoisted(() => ({
  authState: {
    activeOrganizationId: 'org-a',
    permissions: [] as string[],
  },
  api: {
    listBuckets: vi.fn(),
    listStorageProviders: vi.fn(),
    getInfrastructureStorage: vi.fn(),
    getInfrastructureSummary: vi.fn(),
    getBackupSummary: vi.fn(),
    listProjects: vi.fn(),
    listAuditLogs: vi.fn(),
    listObjects: vi.fn(),
  },
}));

vi.mock('../context/auth-context.js', () => ({
  useAuth: () => authState,
}));

vi.mock('../lib/api.js', () => ({
  apiClient: api,
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    authState.permissions = [PERMISSIONS.STORAGE_READ];
    api.listBuckets.mockResolvedValue([
      {
        id: 'bucket-a',
        organizationId: 'org-a',
        storageProviderId: 'provider-a',
        name: 'documents',
        region: null,
        versioning: 'UNVERSIONED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    api.listStorageProviders.mockResolvedValue([]);
    api.listObjects.mockResolvedValue({
      objects: [],
      prefixes: [],
      folders: [],
      nextCursor: null,
      isTruncated: false,
    });
    api.getInfrastructureStorage.mockResolvedValue({
      collectedAt: new Date().toISOString(),
      bucketCount: 1,
      objectCount: 3,
      totalBytes: 4096,
      uploadsLast24h: 2,
      processUploads: 2,
      processBytesUploaded: 4096,
      buckets: [],
      providers: [],
      storageRoot: {
        path: '/srv/vaultstack',
        kind: 'storage_root',
        status: 'ok',
        totalBytes: 100_000,
        usedBytes: 40_000,
        freeBytes: 60_000,
        usedPercent: 40,
        error: null,
      },
    });
    api.getInfrastructureSummary.mockResolvedValue({
      collectedAt: new Date().toISOString(),
      server: { status: 'ok', cpuCores: 4, memoryUsedPercent: 20 },
      disks: { status: 'ok', volumeCount: 1 },
      storage: { objectCount: 3, totalBytes: 4096, unhealthyProviders: 0 },
      docker: { available: false, containersRunning: null },
    });
    api.getBackupSummary.mockResolvedValue({
      jobCounts: {},
      snapshotCount: 2,
      scheduleCount: 1,
      restoreCount: 0,
      latestJob: null,
      latestSnapshot: null,
    });
    api.listProjects.mockResolvedValue([{ id: 'project-a' }]);
    api.listAuditLogs.mockResolvedValue([{ id: 'event-a', action: 'login' }]);
  });

  it('shows only cards permitted for the current role', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Storage used')).toBeInTheDocument();
    expect(screen.getByText('Objects')).toBeInTheDocument();
    expect(screen.queryByText('Backups')).not.toBeInTheDocument();
    expect(screen.queryByText('Server health')).not.toBeInTheDocument();
    expect(screen.queryByText('API activity')).not.toBeInTheDocument();
  });

  it('renders all available dashboard domains for an administrator', async () => {
    authState.permissions = [
      PERMISSIONS.STORAGE_READ,
      PERMISSIONS.INFRASTRUCTURE_READ,
      PERMISSIONS.BACKUP_READ,
      PERMISSIONS.ARTIFACT_READ,
      PERMISSIONS.AUDIT_READ,
    ];

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Backups')).toBeInTheDocument();
      expect(screen.getByText('Artifacts')).toBeInTheDocument();
      expect(screen.getByText('Server health')).toBeInTheDocument();
      expect(screen.getByText('Disk health')).toBeInTheDocument();
      expect(screen.getByText('API activity')).toBeInTheDocument();
    });
  });
});
