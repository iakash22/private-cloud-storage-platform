import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, FieldError, Input, Label } from '@vaultstack/ui';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { loginBodySchema, parseForm, verifyTotpLoginBodySchema } from '@vaultstack/validation';
import { useAuth } from '../context/auth-context.js';
import { detectDevice } from '../lib/device-detect.js';
import { useFormSubmit } from '../lib/form-errors.js';
import { AuthLayout } from './auth-layout.js';

export function LoginPage() {
  const { user, loading, login, verifyTotp } = useAuth();
  const navigate = useNavigate();
  const { fieldErrors, validate, catchError, clearFieldErrors } = useFormSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const device = useMemo(() => detectDevice(), []);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const body = validate(parseForm(loginBodySchema, { email, password }));
      if (!body) {
        return;
      }
      const result = await login(body);
      if ('totpRequired' in result) {
        setChallengeToken(result.challengeToken);
        setCode('');
        clearFieldErrors();
        return;
      }
      void navigate('/');
    } catch (caught) {
      catchError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTotpSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!challengeToken) {
      return;
    }
    setSubmitting(true);

    try {
      const body = validate(parseForm(verifyTotpLoginBodySchema, { challengeToken, code }));
      if (!body) {
        return;
      }
      await verifyTotp(body);
      void navigate('/');
    } catch (caught) {
      catchError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={challengeToken ? 'Two-factor check' : 'Sign in'}
      subtitle={
        challengeToken
          ? 'Open your authenticator app and enter the 6-digit code, or use a one-time backup code.'
          : 'Use your work email to continue to VaultStack.'
      }
      badge={
        challengeToken ? (
          <div className="vs-success-pop flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
            <div>
              <p className="font-display font-semibold">Authenticator required</p>
              <p className="mt-0.5 text-xs text-sky-800">
                Signing in from <span className="font-medium">{device.label}</span>
              </p>
            </div>
          </div>
        ) : null
      }
      footer={
        challengeToken ? null : (
          <p>
            Need an account?{' '}
            <Link className="font-medium text-vs-shade-900 underline underline-offset-4" to="/signup">
              Create one
            </Link>
          </p>
        )
      }
    >
      {challengeToken ? (
        <form className="space-y-4" noValidate onSubmit={(event) => void handleTotpSubmit(event)}>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-vs-shade-100 px-2.5 py-1 text-xs text-vs-shade-600">
            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
            {device.label}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              value={code}
              aria-invalid={Boolean(fieldErrors.code)}
              aria-describedby={fieldErrors.code ? 'code-error' : 'code-hint'}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
            <p id="code-hint" className="text-xs text-vs-shade-500">
              Backup codes look like <span className="font-mono">AAAAA-BBBBB</span>.
            </p>
            <FieldError id="code-error" message={fieldErrors.code} />
          </div>
          <Button type="submit" className="w-full" loading={submitting} loadingLabel="Verifying…">
            Verify & continue
          </Button>
          <button
            type="button"
            className="min-h-11 w-full text-sm text-vs-shade-600 underline underline-offset-4"
            onClick={() => {
              setChallengeToken(null);
              setCode('');
              clearFieldErrors();
            }}
          >
            Use a different account
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => void handlePasswordSubmit(event)}
        >
          {loading ? (
            <p className="text-xs text-vs-shade-500" aria-live="polite">
              Checking existing session…
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <FieldError id="email-error" message={fieldErrors.email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
            <FieldError id="password-error" message={fieldErrors.password} />
          </div>
          <Button type="submit" className="w-full" loading={submitting} loadingLabel="Signing in…">
            Sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
