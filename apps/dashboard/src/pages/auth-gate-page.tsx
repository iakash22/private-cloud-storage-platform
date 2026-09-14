import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, FieldError, Input, Label, PasswordInput } from '@vaultstack/ui';
import { ShieldCheck, Smartphone } from 'lucide-react';
import {
  loginBodySchema,
  parseForm,
  registerBodySchema,
  verifyTotpLoginBodySchema,
} from '@vaultstack/validation';
import { useAuth } from '../context/auth-context.js';
import { detectDevice } from '../lib/device-detect.js';
import { useFormSubmit } from '../lib/form-errors.js';
import { AuthLayout } from './auth-layout.js';

type AuthMode = 'login' | 'signup';

function modeFromPath(pathname: string): AuthMode {
  return pathname.includes('/signup') ? 'signup' : 'login';
}

function LoginFields({
  email,
  password,
  fieldErrors,
  submitting,
  onEmail,
  onPassword,
  onSubmit,
}: {
  email: string;
  password: string;
  fieldErrors: Record<string, string | undefined>;
  submitting: boolean;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="space-y-4" noValidate onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="auth-email">Email</Label>
        <Input
          id="auth-email"
          type="email"
          autoComplete="email"
          value={email}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
          onChange={(event) => { onEmail(event.target.value); }}
        />
        <FieldError id="auth-email-error" message={fieldErrors.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="auth-password">Password</Label>
        <PasswordInput
          id="auth-password"
          autoComplete="current-password"
          value={password}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
          onChange={(event) => { onPassword(event.target.value); }}
        />
        <FieldError id="auth-password-error" message={fieldErrors.password} />
      </div>
      <Button type="submit" className="w-full" loading={submitting} loadingLabel="Signing in…">
        Sign in
      </Button>
    </form>
  );
}

function SignupFields({
  name,
  organizationName,
  email,
  password,
  fieldErrors,
  submitting,
  onName,
  onOrganizationName,
  onEmail,
  onPassword,
  onSubmit,
}: {
  name: string;
  organizationName: string;
  email: string;
  password: string;
  fieldErrors: Record<string, string | undefined>;
  submitting: boolean;
  onName: (value: string) => void;
  onOrganizationName: (value: string) => void;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="space-y-3.5" noValidate onSubmit={onSubmit}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="auth-name">Name</Label>
          <Input
            id="auth-name"
            autoComplete="name"
            value={name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
            onChange={(event) => { onName(event.target.value); }}
          />
          <FieldError id="auth-name-error" message={fieldErrors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-org">Organization</Label>
          <Input
            id="auth-org"
            autoComplete="organization"
            value={organizationName}
            aria-invalid={Boolean(fieldErrors.organizationName)}
            aria-describedby={fieldErrors.organizationName ? 'auth-org-error' : undefined}
            onChange={(event) => { onOrganizationName(event.target.value); }}
          />
          <FieldError id="auth-org-error" message={fieldErrors.organizationName} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="auth-signup-email">Email</Label>
        <Input
          id="auth-signup-email"
          type="email"
          autoComplete="email"
          value={email}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'auth-signup-email-error' : undefined}
          onChange={(event) => { onEmail(event.target.value); }}
        />
        <FieldError id="auth-signup-email-error" message={fieldErrors.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="auth-signup-password">Password</Label>
        <PasswordInput
          id="auth-signup-password"
          autoComplete="new-password"
          value={password}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? 'auth-signup-password-error' : undefined}
          onChange={(event) => { onPassword(event.target.value); }}
        />
        <FieldError id="auth-signup-password-error" message={fieldErrors.password} />
        <p className="text-xs leading-5 text-vs-shade-500">
          At least 10 characters, including a letter and a number.
        </p>
      </div>
      <Button type="submit" className="w-full" loading={submitting} loadingLabel="Please wait…">
        Create account
      </Button>
    </form>
  );
}

/**
 * Shared login/signup experience with liquid-glass card + physics flip.
 * Both `/login` and `/signup` render this so the shell never remounts harshly.
 */
export function AuthGatePage() {
  const { user, loading, error, login, verifyTotp, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const mode = modeFromPath(location.pathname);
  const { fieldErrors, validate, catchError, clearFieldErrors } = useFormSubmit();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const device = useMemo(() => detectDevice(), []);

  const goMode = (next: AuthMode) => {
    if (next === mode) {
      return;
    }
    clearFieldErrors();
    setChallengeToken(null);
    setCode('');
    void navigate(next === 'signup' ? '/signup' : '/login');
  };

  if (loading) {
    return (
      <AuthLayout
        mode={mode}
        title="Sign in"
        subtitle="Use your work email to continue to VaultStack."
        bootstrapping
      />
    );
  }

  if (user) {
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

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const body = validate(
        parseForm(registerBodySchema, { email, password, name, organizationName }),
      );
      if (!body) {
        return;
      }
      await register(body);
      void navigate('/');
    } catch (caught) {
      catchError(caught);
    } finally {
      setSubmitting(false);
    }
  };

  let title = 'Sign in';
  let subtitle = 'Use your work email to continue to VaultStack.';
  let badge: ReactNode = null;
  let footer: ReactNode = (
    <p>
      Need an account?{' '}
      <button
        type="button"
        className="font-medium text-vs-shade-900 underline underline-offset-4"
        onClick={() => { goMode('signup'); }}
      >
        Create one
      </button>
    </p>
  );
  let body: ReactNode = (
    <LoginFields
      email={email}
      password={password}
      fieldErrors={fieldErrors}
      submitting={submitting}
      onEmail={setEmail}
      onPassword={setPassword}
      onSubmit={(event) => void handlePasswordSubmit(event)}
    />
  );

  if (mode === 'signup') {
    title = 'Create your workspace';
    subtitle = 'Spin up a VaultStack organization — you become the first administrator.';
    footer = (
      <p>
        Already have an account?{' '}
        <button
          type="button"
          className="font-medium text-vs-shade-900 underline underline-offset-4"
          onClick={() => { goMode('login'); }}
        >
          Sign in
        </button>
      </p>
    );
    badge = (
      <div className="flex items-start gap-3 rounded-xl border border-sky-200/80 bg-sky-50/80 px-3 py-2.5 text-sm text-sky-950 backdrop-blur-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
        <div>
          <p className="font-display font-semibold">New organization</p>
          <p className="mt-0.5 text-xs leading-5 text-sky-800">
            One form creates your account, org, and admin access.
          </p>
        </div>
      </div>
    );
    body = (
      <SignupFields
        name={name}
        organizationName={organizationName}
        email={email}
        password={password}
        fieldErrors={fieldErrors}
        submitting={submitting}
        onName={setName}
        onOrganizationName={setOrganizationName}
        onEmail={setEmail}
        onPassword={setPassword}
        onSubmit={(event) => void handleRegister(event)}
      />
    );
  } else if (challengeToken) {
    title = 'Two-factor check';
    subtitle =
      'Open your authenticator app and enter the 6-digit code, or use a one-time backup code.';
    footer = null;
    badge = (
      <div className="vs-success-pop flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
        <div>
          <p className="font-display font-semibold">Authenticator required</p>
          <p className="mt-0.5 text-xs text-sky-800">
            Signing in from <span className="font-medium">{device.label}</span>
          </p>
        </div>
      </div>
    );
    body = (
      <form className="space-y-4" noValidate onSubmit={(event) => void handleTotpSubmit(event)}>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-vs-shade-100 px-2.5 py-1 text-xs text-vs-shade-600">
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          {device.label}
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-code">Verification code</Label>
          <Input
            id="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            value={code}
            aria-invalid={Boolean(fieldErrors.code)}
            aria-describedby={fieldErrors.code ? 'auth-code-error' : 'auth-code-hint'}
            onChange={(event) => { setCode(event.target.value); }}
          />
          <p id="auth-code-hint" className="text-xs text-vs-shade-500">
            Backup codes look like <span className="font-mono">AAAAA-BBBBB</span>.
          </p>
          <FieldError id="auth-code-error" message={fieldErrors.code} />
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
    );
  } else if (error) {
    badge = (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
        {error}. You can still sign in below.
      </div>
    );
  }

  const card = (
    <>
      {badge ? <div className="mb-4">{badge}</div> : null}
      <h2 className="font-display text-xl font-semibold tracking-tight text-vs-shade-900 sm:text-2xl">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-vs-shade-500">{subtitle}</p>
      <div className="vs-auth-liquid-glass__form mt-6">{body}</div>
      {footer ? <div className="mt-6 text-center text-sm text-vs-shade-600">{footer}</div> : null}
    </>
  );

  return (
    <AuthLayout mode={mode} flipContent={card} />
  );
}
