import { Navigate, Outlet } from 'react-router-dom';
import { PageSkeleton } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl items-start px-4 py-8 sm:px-6">
        <PageSkeleton className="w-full" />
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
