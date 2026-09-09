import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
} from '@vaultstack/ui';
import { disableTotpBodySchema, enableTotpBodySchema, parseForm } from '@vaultstack/validation';
import type { TotpSetupPayload } from '@vaultstack/types';
import { useAuth } from '../context/auth-context.js';
import { apiClient } from '../lib/api.js';
import { useFormSubmit } from '../lib/form-errors.js';

export function TwoFactorSettings() {
  const { user, refresh } = useAuth();
  const { fieldErrors, validate, catchError, toastSuccess, clearFieldErrors } = useFormSubmit();
  const [setup, setSetup] = useState<TotpSetupPayload | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const enabled = Boolean(user?.twoFactorEnabled);

  const startSetup = async () => {
    setBusy(true);
    try {
      const result = await apiClient.setupTotp();
      setSetup(result);
      setBackupCodes(null);
      setCode('');
      clearFieldErrors();
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async () => {
    const body = validate(parseForm(enableTotpBodySchema, { code }));
    if (!body) {
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient.enableTotp(body);
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setCode('');
      await refresh();
      toastSuccess('Two-factor authentication is on.');
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  const confirmDisable = async () => {
    const body = validate(parseForm(disableTotpBodySchema, { password, code }));
    if (!body) {
      return;
    }
    setBusy(true);
    try {
      await apiClient.disableTotp(body);
      setPassword('');
      setCode('');
      setBackupCodes(null);
      await refresh();
      toastSuccess('Two-factor authentication is off.');
    } catch (caught) {
      catchError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          Protect your account with an authenticator app. This setting belongs to you, not the
          organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Status:{' '}
          <span className="font-medium text-slate-900">{enabled ? 'Enabled' : 'Not enabled'}</span>
        </p>

        {backupCodes ? (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-950">Save these backup codes now</p>
            <p className="text-sm text-amber-900">
              Each code can be used once if you lose your authenticator. They will not be shown
              again.
            </p>
            <ul className="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
              {backupCodes.map((item) => (
                <li key={item} className="rounded-md bg-white px-3 py-2 text-slate-900">
                  {item}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBackupCodes(null);
              }}
            >
              I have saved these codes
            </Button>
          </div>
        ) : null}

        {setup ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Scan the QR code with Google Authenticator, 1Password, or Authy. If the image does not
              scan, enter the secret manually.
            </p>
            {setup.qrSvg ? (
              <img
                alt="Authenticator QR code"
                className="h-48 w-48 max-w-full rounded-lg border border-slate-200 bg-white p-2"
                src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
              />
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="totp-secret">Manual setup key</Label>
              <Input id="totp-secret" readOnly value={setup.secret} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totp-enable-code">Authenticator code</Label>
              <Input
                id="totp-enable-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                aria-invalid={Boolean(fieldErrors.code)}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
              <FieldError message={fieldErrors.code} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void confirmEnable()}>
                {busy ? 'Please wait…' : 'Enable 2FA'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSetup(null);
                  setCode('');
                  clearFieldErrors();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {!enabled && !setup ? (
          <Button type="button" disabled={busy} onClick={() => void startSetup()}>
            {busy ? 'Please wait…' : 'Enable two-factor authentication'}
          </Button>
        ) : null}

        {enabled && !setup ? (
          <div className="space-y-4">
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
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
                <FieldError message={fieldErrors.password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totp-disable-code">Authenticator or backup code</Label>
                <Input
                  id="totp-disable-code"
                  value={code}
                  aria-invalid={Boolean(fieldErrors.code)}
                  onChange={(event) => {
                    setCode(event.target.value);
                  }}
                />
                <FieldError message={fieldErrors.code} />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void confirmDisable()}
            >
              {busy ? 'Please wait…' : 'Disable 2FA'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
