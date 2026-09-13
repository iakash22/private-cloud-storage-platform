import type { ReactNode } from 'react';
import { BrandLogo } from '../components/brand-logo.js';

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
  badge,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div
      data-auth-screen
      className="min-h-[100dvh] overflow-y-auto bg-vs-paper text-vs-ink md:fixed md:inset-0 md:min-h-0 md:overflow-hidden"
    >
      <div className="grid min-h-[100dvh] md:h-full md:min-h-0 md:grid-cols-[minmax(0,1.05fr)_minmax(22rem,1fr)]">
        <aside className="relative overflow-hidden bg-vs-shade-950 px-6 py-8 text-white sm:px-10 md:flex md:h-full md:flex-col md:justify-between md:px-12 md:py-12 lg:px-14">
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
            <div className="flex items-center gap-3">
              <BrandLogo size="lg" />
              <div>
                <p className="vs-eyebrow text-vs-shade-400">Private cloud storage</p>
                <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  VaultStack
                </h1>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-vs-shade-300 sm:text-base">
              Sign in to the control plane for organization storage, backups, and access.
            </p>
          </div>

          <ul className="relative mt-8 hidden space-y-5 md:block">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="max-w-md">
                <p className="font-display text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-vs-shade-400">{item.body}</p>
              </li>
            ))}
          </ul>
        </aside>

        <main className="custom-scrollbar flex items-start justify-center px-4 py-6 sm:px-8 md:h-full md:min-h-0 md:overflow-y-auto md:px-10 md:py-8 lg:px-12">
          <div className="vs-form-field my-auto w-full max-w-[26rem] py-2">
            <div className="vs-panel rounded-2xl border border-vs-shade-200 bg-white p-5 shadow-sm sm:p-8">
              {badge ? <div className="mb-4">{badge}</div> : null}
              <h2 className="font-display text-xl font-semibold tracking-tight text-vs-shade-900 sm:text-2xl">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-vs-shade-500">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
            {footer ? (
              <div className="mt-6 text-center text-sm text-vs-shade-600">{footer}</div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
