import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { RouteTransition } from '../components/route-transition.js';

/** Stable section chrome: sticky nav stays mounted; only the page panel transitions. */
export function SectionShell({
  label,
  nav,
}: {
  label: string;
  nav: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[13.75rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]">
      <aside
        aria-label={label}
        className="custom-scrollbar sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:top-4 lg:mx-0 lg:block lg:max-h-[calc(100dvh-6rem)] lg:space-y-1.5 lg:overflow-y-auto lg:overflow-x-visible lg:px-0"
      >
        {nav}
      </aside>
      <div className="min-w-0">
        <RouteTransition>
          <div className="space-y-6">
            <Outlet />
          </div>
        </RouteTransition>
      </div>
    </div>
  );
}
