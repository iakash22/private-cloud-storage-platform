import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Activity,
  Archive,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button, Select, cn } from '@vaultstack/ui';
import { BrandLogo } from '../components/brand-logo.js';
import { useAuth } from '../context/auth-context.js';
import { canReadBackups } from '../lib/backup-permissions.js';
import { canReadAccess, canReadActivity, canReadArtifacts } from '../lib/dashboard-permissions.js';
import { canReadInfrastructure } from '../lib/infrastructure-permissions.js';
import { canReadStorage } from '../lib/storage-preferences.js';

interface NavigationItem {
  to: string;
  label: string;
  visible: boolean;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

function SidebarContent({
  collapsed,
  navId,
  onNavigate,
}: {
  collapsed: boolean;
  navId: string;
  onNavigate?: () => void;
}) {
  const { user, organizations, activeOrganizationId, permissions, logout, selectOrganization } =
    useAuth();
  const navigate = useNavigate();

  const navigation: NavigationItem[] = [
    { to: '/', label: 'Dashboard', visible: true, icon: LayoutDashboard, end: true },
    { to: '/storage', label: 'Storage', visible: canReadStorage(permissions), icon: HardDrive },
    { to: '/artifacts', label: 'Artifacts', visible: canReadArtifacts(permissions), icon: Package },
    { to: '/backups', label: 'Backups', visible: canReadBackups(permissions), icon: Archive },
    {
      to: '/infrastructure',
      label: 'Infrastructure',
      visible: canReadInfrastructure(permissions),
      icon: Server,
    },
    { to: '/access', label: 'Access', visible: canReadAccess(permissions), icon: ShieldCheck },
    { to: '/activity', label: 'Activity', visible: canReadActivity(permissions), icon: Activity },
    { to: '/settings', label: 'Settings', visible: true, icon: Settings },
  ];

  const handleLogout = () =>
    logout().then(() => {
      void navigate('/login');
    });

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex items-center gap-2 border-b border-slate-200 px-4 py-4',
          collapsed && 'lg:justify-center lg:px-2',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          aria-label="Open dashboard"
          onClick={() => {
            onNavigate?.();
            void navigate('/');
          }}
        >
          <BrandLogo size="sm" animated={false} />
          <div className={cn('min-w-0', collapsed && 'lg:hidden')}>
            <p className="vs-eyebrow">VaultStack</p>
            <p className="truncate font-display text-sm font-semibold text-vs-shade-900">
              Control plane
            </p>
          </div>
        </button>
      </div>

      <nav
        id={navId}
        aria-label="Primary navigation"
        className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {navigation
          .filter((item) => item.visible)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={item.label}
              onClick={() => {
                onNavigate?.();
              }}
              className={({ isActive }) =>
                cn(
                  'vs-nav-item group relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'vs-nav-item--active'
                    : 'text-vs-shade-600 hover:bg-vs-shade-100 hover:text-vs-shade-900',
                  collapsed && 'lg:justify-center lg:px-2',
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && 'lg:hidden')}>{item.label}</span>
            </NavLink>
          ))}
      </nav>

      <div className="space-y-3 border-t border-slate-200 p-3">
        {organizations.length > 1 ? (
          <Select
            aria-label="Active organization"
            className={cn(collapsed && 'lg:hidden')}
            value={activeOrganizationId ?? ''}
            onChange={(value) => {
              void selectOrganization(value);
            }}
            options={organizations.map((organization) => ({
              value: organization.id,
              label: organization.name,
            }))}
          />
        ) : null}
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {(user?.name ?? user?.email ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <div className={cn('min-w-0 flex-1', collapsed && 'lg:hidden')}>
            <p className="truncate text-sm font-medium text-slate-900">{user?.name ?? 'Account'}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('shrink-0', collapsed && 'lg:hidden')}
            aria-label="Log out"
            loadingLabel="Signing out…"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DashboardShell() {
  const { organizations, activeOrganizationId, selectOrganization } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const pageTitle = getPageTitle(location.pathname);

  useEffect(() => {
    const handleActivity = (event: Event) => {
      const detail = (event as CustomEvent<{ active: boolean }>).detail;
      setApiBusy(detail.active);
    };
    window.addEventListener('vaultstack:request-activity', handleActivity);
    return () => window.removeEventListener('vaultstack:request-activity', handleActivity);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-vs-paper" data-app-shell>
      <Helmet>
        <title>{pageTitle} · VaultStack</title>
        <meta
          name="description"
          content={`${pageTitle} in the VaultStack private cloud control plane`}
        />
      </Helmet>

      <aside
        className={cn(
          'hidden h-full shrink-0 border-r border-vs-shade-200 bg-white transition-[width] duration-300 lg:flex lg:flex-col',
          sidebarCollapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <SidebarContent collapsed={sidebarCollapsed} navId="primary-navigation" />
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            aria-label="Close navigation"
            onClick={() => {
              setMobileNavOpen(false);
            }}
          />
          <aside className="vs-drawer-enter relative z-10 flex h-full w-[min(18rem,88vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-sm font-semibold text-slate-900">Menu</p>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="Close navigation"
                onClick={() => {
                  setMobileNavOpen(false);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <SidebarContent
                collapsed={false}
                navId="primary-navigation-mobile"
                onNavigate={() => {
                  setMobileNavOpen(false);
                }}
              />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-30 shrink-0 border-b border-vs-shade-200 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 text-slate-700 lg:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="primary-navigation-mobile"
                onClick={() => {
                  setMobileNavOpen((open) => !open);
                }}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Open navigation</span>
              </button>
              <button
                type="button"
                className="hidden h-11 w-11 items-center justify-center rounded-md border border-slate-200 text-slate-700 lg:inline-flex"
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => {
                  setSidebarCollapsed((value) => !value);
                }}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </button>
              <div className="min-w-0">
                <p className="truncate font-display text-base font-semibold text-vs-shade-900 sm:text-lg">
                  {pageTitle}
                </p>
                <p className="hidden truncate text-xs text-vs-shade-500 sm:block">
                  Organization workspace
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {organizations.length > 1 ? (
                <Select
                  aria-label="Active organization"
                  className="max-w-[9.5rem] sm:max-w-[14rem] lg:hidden"
                  value={activeOrganizationId ?? ''}
                  onChange={(value) => {
                    void selectOrganization(value);
                  }}
                  options={organizations.map((organization) => ({
                    value: organization.id,
                    label: organization.name,
                  }))}
                />
              ) : null}
            </div>
          </div>
          <div className="pointer-events-none h-0.5" aria-hidden="true">
            <div
              className={cn(
                'h-full origin-left bg-sky-500 transition-transform duration-300',
                apiBusy ? 'scale-x-100 animate-pulse' : 'scale-x-0',
              )}
            />
          </div>
        </header>

        <main className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  if (pathname.includes('/buckets')) return 'Buckets';
  if (pathname.includes('/files')) return 'Files';
  if (pathname.includes('/providers')) return 'Storage providers';
  if (pathname.includes('/shares')) return 'Shares';
  if (pathname.includes('/policies')) return 'Policies';
  if (pathname.includes('/usage')) return 'Storage usage';
  if (pathname.includes('/trash')) return 'Trash';
  if (pathname.startsWith('/storage')) return 'Storage';
  if (pathname.startsWith('/artifacts')) return 'Artifacts';
  if (pathname.startsWith('/backups')) return 'Backups';
  if (pathname.startsWith('/infrastructure')) return 'Infrastructure';
  if (pathname.includes('/api-keys')) return 'API keys';
  if (pathname.startsWith('/access')) return 'Access';
  if (pathname.startsWith('/activity')) return 'Activity';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Dashboard';
}
