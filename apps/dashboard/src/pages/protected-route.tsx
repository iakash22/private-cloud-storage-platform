import { Navigate, Outlet } from 'react-router-dom';
import { Skeleton } from '@vaultstack/ui';
import { useAuth } from '../context/auth-context.js';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

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

  return <Outlet />;
}
