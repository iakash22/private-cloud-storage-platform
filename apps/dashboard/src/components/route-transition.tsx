import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@vaultstack/ui';

/**
 * Content-only transition. Use around section <Outlet />, never around the section nav,
 * so tab switches do not remount the side panel / shift layout.
 */
export function RouteTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const location = useLocation();

  return (
    <div key={location.pathname} className={cn('vs-content-enter min-w-0', className)}>
      {children}
    </div>
  );
}
