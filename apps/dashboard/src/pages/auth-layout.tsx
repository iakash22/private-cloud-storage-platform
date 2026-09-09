import type { ReactNode } from 'react';

const HIGHLIGHTS = [
  {
    title: 'Your storage, your servers',
    body: 'Keep objects on a local filesystem first, with optional S3-compatible backends when you need them.',
  },
  {
    title: 'Organization-scoped access',
    body: 'Sessions, roles, and audit trails stay on your control plane — nothing is granted from the browser.',
  },
  {
    title: 'Built for operators',
    body: 'Buckets, backups, artifacts, and infrastructure health in one private cloud console.',
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      data-auth-screen
      className="min-h-[100dvh] overflow-y-auto bg-slate-50 text-slate-900 md:fixed md:inset-0 md:min-h-0 md:overflow-hidden"
    >
      <div className="grid min-h-[100dvh] md:h-full md:min-h-0 md:grid-cols-[minmax(0,1.05fr)_minmax(22rem,1fr)]">
        <aside className="relative overflow-hidden bg-slate-950 px-6 py-8 text-white sm:px-10 md:flex md:h-full md:flex-col md:justify-between md:px-12 md:py-12 lg:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgb(148 163 184) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          />

          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Private cloud storage
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">VaultStack</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-300 sm:text-base">
              Sign in to the control plane for organization storage, backups, and access.
            </p>
          </div>

          <ul className="relative mt-8 hidden space-y-5 md:block">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="max-w-md">
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.body}</p>
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex items-center justify-center px-4 py-6 sm:px-8 md:h-full md:overflow-hidden md:px-10 md:py-8 lg:px-12">
          <div className="w-full max-w-[26rem]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
            {footer ? (
              <div className="mt-6 text-center text-sm text-slate-600">{footer}</div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
