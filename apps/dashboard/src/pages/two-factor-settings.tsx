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
  FieldError,
  Input,
  Label,
  useToast,
} from '@vaultstack/ui';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Laptop,
  QrCode,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { disableTotpBodySchema, enableTotpBodySchema, parseForm } from '@vaultstack/validation';
import type { TotpSetupPayload } from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import {
  detectDevice,
  enrichDeviceNetwork,
  emitTwoFactorDeviceLinked,
  formatDeviceWhen,
  setAuthenticatorSessionEnabled,
  touchCurrentBrowserSession,
  patchAuthenticatorSessions,
  type DetectedDevice,
  type LinkedAuthenticatorDevice,
} from '../lib/device-detect.js';
import { apiClient } from '../lib/api.js';
import { useFormSubmit } from '../lib/form-errors.js';

type SetupStep = 'scan' | 'verify' | 'backup';

const STEPS: Array<{ id: SetupStep; label: string; hint: string }> = [
  { id: 'scan', label: 'Scan QR', hint: 'Add app' },
  { id: 'verify', label: 'Verify', hint: 'Enter OTP' },
  { id: 'backup', label: 'Backup', hint: 'Save codes' },
];

function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

function SessionDetailRows({
  device,
  linkedAt,
  lastSeenAt,
  activeCount,
}: {
  device: DetectedDevice;
  linkedAt?: string;
  lastSeenAt?: string;
  activeCount?: number;
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: 'Browser',
      value: device.browserVersion ? `${device.browser} ${device.browserVersion}` : device.browser,
    },
    {
      label: 'Operating system',
      value: device.osVersion ? `${device.os} ${device.osVersion}` : device.os,
    },
    { label: 'Platform', value: device.platform },
    { label: 'Device type', value: device.isMobile ? 'Mobile / tablet' : 'Desktop' },
    { label: 'Language', value: device.languages.slice(0, 3).join(', ') || device.language },
    { label: 'Time zone', value: device.timeZone },
    { label: 'Screen', value: `${device.screen} @ ${device.devicePixelRatio}x` },
  ];
  if (device.cores) {
    rows.push({ label: 'CPU cores', value: String(device.cores) });
  }
  if (device.memoryGb) {
    rows.push({ label: 'Device memory', value: `${device.memoryGb} GB` });
  }
  if (device.ipAddress) {
    rows.push({ label: 'IP address', value: device.ipAddress });
  }
  if (device.approxLocation) {
    rows.push({ label: 'Approx. location', value: device.approxLocation });
  }
  if (device.isp) {
    rows.push({ label: 'Network', value: device.isp });
  }
  if (linkedAt) {
    rows.push({ label: 'First linked', value: formatDeviceWhen(linkedAt) });
  }
  if (lastSeenAt) {
    rows.push({ label: 'Last active', value: formatDeviceWhen(lastSeenAt) });
  }
  if (typeof activeCount === 'number') {
    rows.push({
      label: 'Times active',
      value: `${activeCount} time${activeCount === 1 ? '' : 's'}`,
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

function SetupStepper({ step }: { step: SetupStep }) {
  const stepIndex = STEPS.findIndex((item) => item.id === step);
  return (
    <div className="space-y-3">
      <div className="relative grid grid-cols-3 gap-2">
        <div
          className="pointer-events-none absolute left-[16%] right-[16%] top-5 h-0.5 rounded-full bg-slate-200"
          aria-hidden="true"
        />
        <div
          className="vs-stepper-fill pointer-events-none absolute left-[16%] top-5 h-0.5 rounded-full bg-slate-900"
          style={{ width: `${Math.max(0, stepIndex) * 34}%` }}
          aria-hidden="true"
        />
        {STEPS.map((item, index) => {
          const active = item.id === step;
          const done = index < stepIndex;
          return (
            <div key={item.id} className="relative z-10 flex flex-col items-center gap-2 text-center">
              <span
                className={
                  active
                    ? 'flex h-10 w-10 scale-105 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white shadow-md ring-4 ring-slate-900/10 transition-all duration-300'
                    : done
                      ? 'flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-all duration-300'
                      : 'flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-400 transition-all duration-300'
                }
              >
                {done && !active ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
              </span>
              <div>
                <p
                  className={
                    active
                      ? 'text-xs font-semibold text-slate-900 transition-colors duration-300'
                      : done
                        ? 'text-xs font-semibold text-emerald-700 transition-colors duration-300'
                        : 'text-xs font-medium text-slate-400 transition-colors duration-300'
                  }
                >
                  {item.label}
                </p>
                <p className="text-[10px] text-slate-400">{item.hint}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TwoFactorSettings() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const { fieldErrors, validate, catchError, toastSuccess, clearFieldErrors } = useFormSubmit();
  const [setup, setSetup] = useState<TotpSetupPayload | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<SetupStep>('scan');
  const [copied, setCopied] = useState<string | null>(null);
  const [device, setDevice] = useState<DetectedDevice>(() => detectDevice());
  const [sessions, setSessions] = useState<LinkedAuthenticatorDevice[]>([]);
  const [detailSession, setDetailSession] = useState<LinkedAuthenticatorDevice | null>(null);
  const enabled = Boolean(user?.twoFactorEnabled);

  useEffect(() => {
    let cancelled = false;
    const base = detectDevice();
    setSessions(touchCurrentBrowserSession(base, user?.email));
    void enrichDeviceNetwork(base).then((enriched) => {
      if (cancelled) {
        return;
      }
      setDevice(enriched);
      setSessions((current) =>
        patchAuthenticatorSessions(
          current.map((item) =>
            item.status === 'current'
              ? {
                  ...item,
                  ...enriched,
                  activeCount: item.activeCount,
                  enabled: item.enabled,
                  id: item.id,
                  linkedAt: item.linkedAt,
                  lastSeenAt: item.lastSeenAt,
                  status: item.status,
                  email: item.email,
                }
              : item,
          ),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => {
        setCopied((current) => (current === key ? null : current));
      }, 1800);
    } catch {
      catchError(new Error('Unable to copy to clipboard'));
    }
  };

  const resetEnrollment = () => {
    setSetup(null);
    setCode('');
    setStep('scan');
    setBackupCodes(null);
    setModalOpen(false);
    clearFieldErrors();
  };

  const startSetup = async () => {
    setBusy(true);
    try {
      const result = await apiClient.setupTotp();
      setSetup(result);
      setBackupCodes(null);
      setCode('');
      setStep('scan');
      setModalOpen(true);
      clearFieldErrors();
      void enrichDeviceNetwork(detectDevice()).then(setDevice);
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }
    const body = validate(parseForm(enableTotpBodySchema, { code: trimmed }));
    if (!body) {
      toast.error('That authenticator code looks invalid. Check the digits and try again.');
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient.enableTotp(body);
      const linkedAt = new Date().toISOString();
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setCode('');
      setStep('backup');
      await refresh({ silent: true });
      emitTwoFactorDeviceLinked({
        device,
        email: user?.email,
        linkedAt,
      });
      setSessions(touchCurrentBrowserSession(device, user?.email));
      toastSuccess(`Authenticator linked on ${device.label}`);
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    const body = validate(parseForm(disableTotpBodySchema, { password, code }));
    if (!body) {
      toast.error('Password and authenticator code are required to disable 2FA.');
      return;
    }
    setBusy(true);
    try {
      await apiClient.disableTotp(body);
      setPassword('');
      setCode('');
      setBackupCodes(null);
      setModalOpen(false);
      setStep('scan');
      await refresh({ silent: true });
      toastSuccess('Two-factor authentication is off.');
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  const toggleSession = (session: LinkedAuthenticatorDevice) => {
    setSessions(setAuthenticatorSessionEnabled(session.id, !session.enabled));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Two-factor authentication</CardTitle>
          <CardDescription>
            Protect your account with an authenticator app. Manage browser sessions and enroll MFA
            in a guided modal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="inline-flex items-center gap-2 text-sm text-slate-600">
              <ShieldCheck className="h-4 w-4 text-slate-700" aria-hidden="true" />
              Status:{' '}
              <span className="font-semibold text-slate-900">
                {enabled || Boolean(backupCodes) ? 'Enabled' : 'Not enabled'}
              </span>
            </div>
            <p className="text-xs text-slate-500">{device.label}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-slate-900">Browser sessions</h3>
              <p className="text-xs text-slate-500">{sessions.length} recorded</p>
            </div>
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
                      {session.status === 'current' ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          Current
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {session.approxLocation ?? session.timeZone}
                      {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                      {` · Active ${session.activeCount}×`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`View details for ${session.label}`}
                    onClick={() => setDetailSession(session)}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={session.enabled}
                    aria-label={session.enabled ? 'Set session inactive' : 'Set session active'}
                    className={
                      session.enabled
                        ? 'inline-flex h-9 min-w-[5.5rem] items-center justify-between gap-2 rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition'
                        : 'inline-flex h-9 min-w-[5.5rem] items-center justify-between gap-2 rounded-full bg-slate-300 px-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 transition'
                    }
                    onClick={() => toggleSession(session)}
                  >
                    {session.enabled ? (
                      <>
                        <span className="pl-1.5">Active</span>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-emerald-700 shadow">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow" />
                        <span className="pr-1.5">Off</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {!enabled && !modalOpen ? (
            <Button
              type="button"
              loading={busy}
              loadingLabel="Preparing…"
              onClick={() => void startSetup()}
            >
              Enable two-factor authentication
            </Button>
          ) : null}

          {!enabled && modalOpen ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Enrollment in progress — finish the steps in the setup dialog.
            </p>
          ) : null}

          {enabled && !modalOpen ? (
            <div className="space-y-4 rounded-xl border border-slate-200 p-4">
              <p className="text-sm text-slate-600">
                Turn this off with your password and a current authenticator or backup code.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="totp-disable-password">Password</Label>
                  <Input
                    id="totp-disable-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    aria-invalid={Boolean(fieldErrors.password)}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <FieldError message={fieldErrors.password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totp-disable-code">Authenticator or backup code</Label>
                  <Input
                    id="totp-disable-code"
                    value={code}
                    aria-invalid={Boolean(fieldErrors.code)}
                    onChange={(event) => setCode(event.target.value)}
                  />
                  <FieldError message={fieldErrors.code} />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                loading={busy}
                loadingLabel="Disabling…"
                onClick={() => void confirmDisable()}
              >
                Disable 2FA
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetEnrollment();
          }
        }}
        title="Set up two-factor authentication"
        description="Scan the QR with your authenticator, then continue to enter the one-time code. Enabling is confirmed only when the code verifies on the server."
        className="!w-[min(100%-1rem,26rem)] !max-w-md"
        footer={
          step === 'scan' ? (
            <DialogActions
              cancelLabel="Cancel"
              confirmLabel="Continue to verify"
              onCancel={resetEnrollment}
              onConfirm={() => setStep('verify')}
            />
          ) : step === 'verify' ? (
            <DialogActions
              cancelLabel="Back"
              confirmLabel={busy ? 'Verifying…' : 'Confirm & enable'}
              confirmDisabled={busy}
              confirmLoading={busy}
              onCancel={() => setStep('scan')}
              onConfirm={() => void confirmEnable()}
            />
          ) : (
            <DialogActions
              cancelLabel="Close"
              confirmLabel="Done"
              onCancel={resetEnrollment}
              onConfirm={resetEnrollment}
            />
          )
        }
      >
        <div className="space-y-4">
          <SetupStepper step={step} />

          <div key={step} className="vs-step-enter space-y-4">
            {step === 'scan' ? (
              <div className="flex w-full flex-col gap-3">
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm text-slate-600">
                  Scan this QR in Microsoft Authenticator (or any TOTP app), then press{' '}
                  <span className="font-semibold text-slate-900">Continue to verify</span>. Authenticator
                  apps do not notify our server when a QR is scanned.
                </p>
                {setup?.qrSvg ? (
                  <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <img
                      alt="Authenticator QR code"
                      className="mx-auto h-40 w-40 max-w-full sm:h-44 sm:w-44"
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
                    />
                  </div>
                ) : (
                  <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 sm:h-44 sm:w-44">
                    <QrCode className="h-10 w-10 text-slate-300" aria-hidden="true" />
                  </div>
                )}

                <div className="w-full space-y-2">
                  <Label htmlFor="totp-secret">Manual setup key</Label>
                  <Input
                    id="totp-secret"
                    readOnly
                    value={setup?.secret ?? ''}
                    className="w-full font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      if (setup?.secret) {
                        void copyText(setup.secret, 'secret');
                      }
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                    {copied === 'secret' ? 'Copied setup key' : 'Copy setup key'}
                  </Button>
                  {setup?.otpauthUri ? (
                    <a
                      className="inline-flex text-sm font-medium text-sky-700 underline underline-offset-4"
                      href={setup.otpauthUri}
                    >
                      Open in authenticator app
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 'verify' ? (
              <div className="w-full space-y-4 text-center">
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                  Enter the 6-digit code from your authenticator. Confirm checks it on the server
                  before enabling 2FA.
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="totp-enable-code">One-time password</Label>
                  <Input
                    id="totp-enable-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123456"
                    className="text-center font-mono text-lg tracking-[0.35em]"
                    value={code}
                    aria-invalid={Boolean(fieldErrors.code)}
                    onChange={(event) => setCode(digitsOnly(event.target.value))}
                  />
                  <FieldError message={fieldErrors.code} />
                </div>
              </div>
            ) : null}

            {step === 'backup' && backupCodes ? (
              <div className="vs-success-pop space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-display text-base font-semibold text-emerald-950">
                      Authenticator linked successfully
                    </p>
                    <p className="mt-1 text-sm text-emerald-900">
                      Enrollment completed for <span className="font-medium">{device.label}</span>.
                    </p>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-950">Save these backup codes now</p>
                  <ul className="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
                    {backupCodes.map((item) => (
                      <li key={item} className="rounded-md bg-white px-3 py-2 text-slate-900">
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void copyText(backupCodes.join('\n'), 'codes')}
                    >
                      <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                      {copied === 'codes' ? 'Copied' : 'Copy codes'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        downloadTextFile(
                          'vaultstack-backup-codes.txt',
                          `VaultStack backup codes\nDevice: ${device.label}\n\n${backupCodes.join('\n')}\n`,
                        );
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detailSession)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSession(null);
          }
        }}
        title="Session details"
        description="Full fingerprint for this browser session, including how many times it has been active."
        className="!w-[min(100%-1.5rem,40rem)] !max-w-xl"
        footer={
          <DialogActions
            cancelLabel="Close"
            confirmLabel="Done"
            onCancel={() => setDetailSession(null)}
            onConfirm={() => setDetailSession(null)}
          />
        }
      >
        {detailSession ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                {detailSession.isMobile ? (
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Laptop className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-semibold text-slate-900">
                  {detailSession.label}
                </p>
                <p className="text-xs text-slate-500">
                  {detailSession.enabled ? 'Active session' : 'Inactive session'} · recorded{' '}
                  {detailSession.activeCount}×
                </p>
              </div>
            </div>
            <SessionDetailRows
              device={detailSession}
              linkedAt={detailSession.linkedAt}
              lastSeenAt={detailSession.lastSeenAt}
              activeCount={detailSession.activeCount}
            />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
