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
  PasswordInput,
  useToast,
} from '@vaultstack/ui';
import { Check, CheckCircle2, Copy, Download, QrCode, ShieldCheck } from 'lucide-react';
import { disableTotpBodySchema, enableTotpBodySchema, parseForm } from '@vaultstack/validation';
import type { TotpSetupPayload } from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import {
  detectDevice,
  enrichDeviceNetwork,
  emitTwoFactorDeviceLinked,
  type DetectedDevice,
} from '../lib/device-detect.js';
import { apiClient } from '../lib/api.js';
import { useFormSubmit } from '../lib/form-errors.js';

type SetupStep = 'scan' | 'verify' | 'backup';

const STEPS: { id: SetupStep; label: string; hint: string }[] = [
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
  const enabled = Boolean(user?.twoFactorEnabled);

  useEffect(() => {
    let cancelled = false;
    void enrichDeviceNetwork(detectDevice()).then((enriched) => {
      if (!cancelled) {
        setDevice(enriched);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Two-factor authentication</CardTitle>
          <CardDescription>
            Protect your account with an authenticator app. Enrollment happens in a guided modal.
            Manage signed-in devices under Active sessions.
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
                  <PasswordInput
                    id="totp-disable-password"
                    autoComplete="current-password"
                    value={password}
                    aria-invalid={Boolean(fieldErrors.password)}
                    onChange={(event) => { setPassword(event.target.value); }}
                  />
                  <FieldError message={fieldErrors.password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="totp-disable-code">Authenticator or backup code</Label>
                  <Input
                    id="totp-disable-code"
                    value={code}
                    aria-invalid={Boolean(fieldErrors.code)}
                    onChange={(event) => { setCode(event.target.value); }}
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
        description={
          step === 'scan'
            ? 'Scan this QR in your authenticator app, then press Continue to verify. Enabling is confirmed only when the code verifies on the server.'
            : step === 'verify'
              ? 'Enter the one-time code from your authenticator. Enabling is confirmed only when the code verifies on the server.'
              : 'Save these backup codes somewhere safe. Each code can be used once if you lose access to your authenticator.'
        }
        className="!w-[min(100%-1rem,36rem)] !max-w-xl"
        scrollable={step === 'backup'}
        footer={
          step === 'scan' ? (
            <DialogActions
              cancelLabel="Cancel"
              confirmLabel="Continue to verify"
              onCancel={resetEnrollment}
              onConfirm={() => { setStep('verify'); }}
            />
          ) : step === 'verify' ? (
            <DialogActions
              cancelLabel="Back"
              confirmLabel={busy ? 'Verifying…' : 'Confirm & enable'}
              confirmDisabled={busy}
              confirmLoading={busy}
              onCancel={() => { setStep('scan'); }}
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
        <div className="space-y-3 sm:space-y-4">
          <SetupStepper step={step} />

          <div key={step} className="vs-step-enter space-y-3 sm:space-y-4">
            {step === 'scan' ? (
              <div className="flex w-full flex-col gap-3">
                {setup?.qrSvg ? (
                  <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                    <img
                      alt="Authenticator QR code"
                      className="mx-auto h-36 w-36 max-w-full sm:h-44 sm:w-44"
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
                    />
                  </div>
                ) : (
                  <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 sm:h-44 sm:w-44">
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
              <div className="w-full space-y-3 text-center sm:space-y-4">
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
                    onChange={(event) => { setCode(digitsOnly(event.target.value)); }}
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
    </>
  );
}
