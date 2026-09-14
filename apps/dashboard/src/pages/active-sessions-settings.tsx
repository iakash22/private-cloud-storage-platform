import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogActions,
} from '@vaultstack/ui';
import { Eye, Laptop, MapPin, MonitorSmartphone, Smartphone } from 'lucide-react';
import type { PublicAuthSession } from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import { apiClient } from '../lib/api.js';
import { useFormSubmit } from '../lib/form-errors.js';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 14) {
    return `${days}d ago`;
  }
  return date.toLocaleString();
}

function SessionDetailRows({ session }: { session: PublicAuthSession }) {
  const coords =
    session.latitude != null && session.longitude != null
      ? `${session.latitude.toFixed(4)}, ${session.longitude.toFixed(4)}`
      : null;

  const rows: { label: string; value: string }[] = [
    { label: 'Device', value: session.label },
    { label: 'Browser', value: session.browser },
    { label: 'Operating system', value: session.os },
    { label: 'Device type', value: session.isMobile ? 'Mobile / tablet' : 'Desktop' },
    { label: 'IP address', value: session.ipAddress ?? 'Unknown' },
    {
      label: 'Location',
      value: session.locationLabel ?? 'Unavailable',
    },
  ];
  if (session.city) {
    rows.push({ label: 'City', value: session.city });
  }
  if (session.region) {
    rows.push({ label: 'Region', value: session.region });
  }
  if (session.country) {
    rows.push({ label: 'Country', value: session.country });
  }
  if (coords) {
    rows.push({ label: 'Approx. coordinates', value: coords });
  }
  if (session.isp) {
    rows.push({ label: 'Network / ISP', value: session.isp });
  }
  rows.push(
    { label: 'Signed in', value: formatWhen(session.createdAt) },
    { label: 'Last active', value: formatWhen(session.lastSeenAt) },
    { label: 'Expires', value: formatWhen(session.expiresAt) },
  );
  if (session.locationAccuracy) {
    rows.push({
      label: 'Location accuracy',
      value: 'IP-based approximate (not GPS)',
    });
  }

  return (
    <dl className="grid gap-0 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="border-b border-slate-200/80 bg-white px-4 py-2.5 last:border-b-0 sm:odd:border-r"
        >
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {row.label}
          </dt>
          <dd className="mt-0.5 break-all text-sm text-slate-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ActiveSessionsSettings() {
  const { logout } = useAuth();
  const { catchError, toastSuccess } = useFormSubmit();
  const [sessions, setSessions] = useState<PublicAuthSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [detail, setDetail] = useState<PublicAuthSession | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PublicAuthSession | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const next = await apiClient.listSessions();
      setSessions(next);
    } catch (caught) {
      catchError(caught);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const otherCount = sessions.filter((session) => !session.current).length;

  const handleRevoke = async (session: PublicAuthSession) => {
    setBusyId(session.id);
    try {
      const result = await apiClient.revokeSession(session.id);
      setConfirmRevoke(null);
      setDetail(null);
      if (result.revokedCurrent) {
        toastSuccess('Signed out of this device.');
        await logout();
        return;
      }
      toastSuccess(`Signed out ${session.label}.`);
      await loadSessions();
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    setRevokingOthers(true);
    try {
      const result = await apiClient.revokeOtherSessions();
      setConfirmOthers(false);
      toastSuccess(
        result.revokedCount === 0
          ? 'No other sessions were active.'
          : `Signed out ${result.revokedCount} other session${result.revokedCount === 1 ? '' : 's'}.`,
      );
      await loadSessions();
    } catch (caught) {
      catchError(caught);
    } finally {
      setRevokingOthers(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="font-display inline-flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 text-slate-700" aria-hidden="true" />
              Active sessions
            </CardTitle>
            <CardDescription>
              Server-backed sign-ins for your account. Location uses IP geolocation (city / region /
              approximate coordinates) — not device GPS. Revoke any session you do not recognize.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={loading || otherCount === 0 || revokingOthers}
            onClick={() => { setConfirmOthers(true); }}
          >
            Sign out other sessions
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Loading sessions…
            </p>
          ) : sessions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No active sessions found.
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    {session.isMobile ? (
                      <Smartphone className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Laptop className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{session.label}</p>
                      {session.current ? (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          This device
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {session.locationLabel ?? 'Location unavailable'}
                      </span>
                      <span className="font-mono text-slate-600">
                        {session.ipAddress ?? 'No IP'}
                      </span>
                      <span>· Last active {formatWhen(session.lastSeenAt)}</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`View details for ${session.label}`}
                    onClick={() => { setDetail(session); }}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={busyId === session.id}
                    loadingLabel="Signing out…"
                    onClick={() => { setConfirmRevoke(session); }}
                  >
                    {session.current ? 'Sign out' : 'Revoke'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            Coordinates are approximate and come from public IP databases. Exact GPS is not available
            for remote sessions.
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
          }
        }}
        title="Session details"
        description="Full fingerprint for this signed-in session, including IP-derived location."
        className="!w-[min(100%-1.5rem,40rem)] !max-w-xl"
        footer={
          <DialogActions
            cancelLabel="Close"
            confirmLabel={detail?.current ? 'Sign out' : 'Revoke session'}
            confirmLoading={busyId === detail?.id}
            onCancel={() => { setDetail(null); }}
            onConfirm={() => {
              if (detail) {
                setConfirmRevoke(detail);
              }
            }}
          />
        }
      >
        {detail ? <SessionDetailRows session={detail} /> : null}
      </Dialog>

      <Dialog
        open={Boolean(confirmRevoke)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRevoke(null);
          }
        }}
        title={confirmRevoke?.current ? 'Sign out this device?' : 'Revoke this session?'}
        description={
          confirmRevoke?.current
            ? 'You will need to sign in again on this browser.'
            : `This signs out ${confirmRevoke?.label ?? 'the selected device'} immediately.`
        }
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel={confirmRevoke?.current ? 'Sign out' : 'Revoke session'}
            confirmLoading={busyId === confirmRevoke?.id}
            onCancel={() => { setConfirmRevoke(null); }}
            onConfirm={() => {
              if (confirmRevoke) {
                void handleRevoke(confirmRevoke);
              }
            }}
          />
        }
      >
        {confirmRevoke ? (
          <p className="text-sm text-slate-600">
            {confirmRevoke.locationLabel ?? 'Unknown location'}
            {confirmRevoke.ipAddress ? ` · ${confirmRevoke.ipAddress}` : ''}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title="Sign out other sessions?"
        description={`This revokes ${otherCount} other active session${otherCount === 1 ? '' : 's'} and keeps you signed in on this device.`}
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Sign out others"
            confirmLoading={revokingOthers}
            onCancel={() => { setConfirmOthers(false); }}
            onConfirm={() => void handleRevokeOthers()}
          />
        }
      >
        <p className="text-sm text-slate-600">
          Use this if you notice unfamiliar devices or after enabling two-factor authentication.
        </p>
      </Dialog>
    </>
  );
}
