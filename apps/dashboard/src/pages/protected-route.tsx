import { Navigate, Outlet } from 'react-router-dom';
import { Skeleton } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';
import { canReadBackups } from '../lib/backup-permissions.js';
import { canReadStorage } from '../lib/storage-preferences.js';

export function ProtectedRoute() {
  const { user, loading, permissions } = useAuth();

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canReadStorage(permissions) && !canReadBackups(permissions)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
        <p className="text-sm text-slate-600">
          Your account does not have storage.read or backup.read permission.
        </p>
      </main>
    );
  }

  return <Outlet />;
}
