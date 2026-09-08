import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/auth-context.js';
import { LoginPage } from './pages/login-page.js';
import { PublicSharePage } from './pages/public-share-page.js';
import { ProtectedRoute } from './pages/protected-route.js';
import { BackupsLayout } from './pages/backups/backups-layout.js';
import { BackupsOverviewPage } from './pages/backups/backups-overview-page.js';
import { BackupsJobsPage } from './pages/backups/backups-jobs-page.js';
import { BackupsSchedulesPage } from './pages/backups/backups-schedules-page.js';
import { BackupsSnapshotsPage } from './pages/backups/backups-snapshots-page.js';
import { BackupsRestorePage } from './pages/backups/backups-restore-page.js';
import { BucketsPage } from './pages/storage/buckets-page.js';
import { FilesPage } from './pages/storage/files-page.js';
import { ProvidersPage } from './pages/storage/providers-page.js';
import { SharesPage } from './pages/storage/shares-page.js';
import { StorageLayout } from './pages/storage/storage-layout.js';
import { StorageOverviewPage } from './pages/storage/storage-overview-page.js';
import { TrashPage } from './pages/storage/trash-page.js';
import { UsagePage } from './pages/storage/usage-page.js';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:token" element={<PublicSharePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/storage" replace />} />
          <Route path="/storage" element={<StorageLayout />}>
            <Route index element={<StorageOverviewPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="buckets" element={<BucketsPage />} />
            <Route path="providers" element={<ProvidersPage />} />
            <Route path="shares" element={<SharesPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
          <Route path="/backups" element={<BackupsLayout />}>
            <Route index element={<BackupsOverviewPage />} />
            <Route path="jobs" element={<BackupsJobsPage />} />
            <Route path="schedules" element={<BackupsSchedulesPage />} />
            <Route path="snapshots" element={<BackupsSnapshotsPage />} />
            <Route path="restore" element={<BackupsRestorePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/storage" replace />} />
      </Routes>
    </AuthProvider>
  );
}
