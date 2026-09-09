import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, FieldError, Input, Label } from '@vaultstack/ui';
import { loginBodySchema, parseForm, verifyTotpLoginBodySchema } from '@vaultstack/validation';
import { useAuth } from '../context/auth-context.js';
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
      title={challengeToken ? 'Authenticator code' : 'Sign in'}
      subtitle={
        challengeToken
          ? 'Enter the 6-digit code from your authenticator app, or a backup code.'
          : 'Use your work email to continue to VaultStack.'
      }
      footer={
        challengeToken ? null : (
          <p>
            Need an account?{' '}
            <Link className="font-medium text-slate-900 underline underline-offset-4" to="/signup">
              Create one
            </Link>
          </p>
        )
      }
    >
      {challengeToken ? (
        <form className="space-y-4" noValidate onSubmit={(event) => void handleTotpSubmit(event)}>
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
              aria-describedby={fieldErrors.code ? 'code-error' : undefined}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
            <FieldError id="code-error" message={fieldErrors.code} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Continue'}
          </Button>
          <button
            type="button"
            className="min-h-11 w-full text-sm text-slate-600 underline underline-offset-4"
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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Please wait…' : 'Sign in'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
