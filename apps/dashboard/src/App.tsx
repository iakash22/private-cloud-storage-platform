import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@vaultstack/ui';
import { SessionGuard } from './components/session-guard.js';
import { AuthProvider } from './context/auth-context.js';
import { LoginPage } from './pages/login-page.js';
import { SignupPage } from './pages/signup-page.js';
import { PublicSharePage } from './pages/public-share-page.js';
import { ProtectedRoute } from './pages/protected-route.js';
import { BackupsLayout } from './pages/backups/backups-layout.js';
import { BackupsOverviewPage } from './pages/backups/backups-overview-page.js';
import { BackupsJobsPage } from './pages/backups/backups-jobs-page.js';
import { BackupsSchedulesPage } from './pages/backups/backups-schedules-page.js';
import { BackupsSnapshotsPage } from './pages/backups/backups-snapshots-page.js';
import { BackupsRestorePage } from './pages/backups/backups-restore-page.js';
import { InfrastructureLayout } from './pages/infrastructure/infrastructure-layout.js';
import { InfrastructureOverviewPage } from './pages/infrastructure/infrastructure-overview-page.js';
import { InfrastructureServerPage } from './pages/infrastructure/infrastructure-server-page.js';
import { InfrastructureDisksPage } from './pages/infrastructure/infrastructure-disks-page.js';
import { InfrastructureStoragePage } from './pages/infrastructure/infrastructure-storage-page.js';
import { InfrastructureDockerPage } from './pages/infrastructure/infrastructure-docker-page.js';
import { BucketsPage } from './pages/storage/buckets-page.js';
import { FilesPage } from './pages/storage/files-page.js';
import { ProvidersPage } from './pages/storage/providers-page.js';
import { SharesPage } from './pages/storage/shares-page.js';
import { StorageLayout } from './pages/storage/storage-layout.js';
import { StorageOverviewPage } from './pages/storage/storage-overview-page.js';
import { TrashPage } from './pages/storage/trash-page.js';
import { UsagePage } from './pages/storage/usage-page.js';
import { AccessLayout } from './pages/access/access-layout.js';
import { ApiKeysPage } from './pages/access/api-keys-page.js';
import { RolesPage } from './pages/access/roles-page.js';
import { ServiceAccountsPage } from './pages/access/service-accounts-page.js';
import { TeamsPage } from './pages/access/teams-page.js';
import { UsersPage } from './pages/access/users-page.js';
import { ArtifactsLayout } from './pages/artifacts/artifacts-layout.js';
import { ArtifactsProjectPage } from './pages/artifacts/artifacts-project-page.js';
import { ArtifactsProjectsPage } from './pages/artifacts/artifacts-projects-page.js';
import { ActivityPage } from './pages/activity-page.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { DashboardShell } from './pages/dashboard-shell.js';
import { SettingsPage } from './pages/settings-page.js';
import { PoliciesPage } from './pages/storage/policies-page.js';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SessionGuard>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/s/:token" element={<PublicSharePage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/storage" element={<StorageLayout />}>
                  <Route index element={<StorageOverviewPage />} />
                  <Route path="files" element={<FilesPage />} />
                  <Route path="buckets" element={<BucketsPage />} />
                  <Route path="providers" element={<ProvidersPage />} />
                  <Route path="shares" element={<SharesPage />} />
                  <Route path="policies" element={<PoliciesPage />} />
                  <Route path="usage" element={<UsagePage />} />
                  <Route path="trash" element={<TrashPage />} />
                </Route>
                <Route path="/artifacts" element={<ArtifactsLayout />}>
                  <Route index element={<ArtifactsProjectsPage />} />
                  <Route path=":projectId" element={<ArtifactsProjectPage />} />
                </Route>
                <Route path="/backups" element={<BackupsLayout />}>
                  <Route index element={<BackupsOverviewPage />} />
                  <Route path="jobs" element={<BackupsJobsPage />} />
                  <Route path="schedules" element={<BackupsSchedulesPage />} />
                  <Route path="snapshots" element={<BackupsSnapshotsPage />} />
                  <Route path="restore" element={<BackupsRestorePage />} />
                </Route>
                <Route path="/infrastructure" element={<InfrastructureLayout />}>
                  <Route index element={<InfrastructureOverviewPage />} />
                  <Route path="server" element={<InfrastructureServerPage />} />
                  <Route path="disks" element={<InfrastructureDisksPage />} />
                  <Route path="storage" element={<InfrastructureStoragePage />} />
                  <Route path="docker" element={<InfrastructureDockerPage />} />
                </Route>
                <Route path="/access" element={<AccessLayout />}>
                  <Route index element={<UsersPage />} />
                  <Route path="roles" element={<RolesPage />} />
                  <Route path="teams" element={<TeamsPage />} />
                  <Route path="api-keys" element={<ApiKeysPage />} />
                  <Route path="service-accounts" element={<ServiceAccountsPage />} />
                </Route>
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionGuard>
      </AuthProvider>
    </ToastProvider>
  );
}
