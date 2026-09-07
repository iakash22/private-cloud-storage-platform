import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/auth-context.js';
import { LoginPage } from './pages/login-page.js';
import { ProtectedRoute } from './pages/protected-route.js';
import { BucketsPage } from './pages/storage/buckets-page.js';
import { FilesPage } from './pages/storage/files-page.js';
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
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/storage" replace />} />
          <Route path="/storage" element={<StorageLayout />}>
            <Route index element={<StorageOverviewPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="buckets" element={<BucketsPage />} />
            <Route path="shares" element={<SharesPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="trash" element={<TrashPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/storage" replace />} />
      </Routes>
    </AuthProvider>
  );
}
