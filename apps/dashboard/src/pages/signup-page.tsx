import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, FieldError, Input, Label } from '@vaultstack/ui';
import { parseForm, registerBodySchema } from '@vaultstack/validation';
import { useAuth } from '../context/auth-context.js';
import { useFormSubmit } from '../lib/form-errors.js';
import { AuthLayout } from './auth-layout.js';

export function SignupPage() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
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

  return (
    <AuthLayout
      title="Create your workspace"
      subtitle="Start a VaultStack organization. You become the first administrator."
      footer={
        <p>
          Already have an account?{' '}
          <Link className="font-medium text-slate-900 underline underline-offset-4" to="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            autoComplete="name"
            value={name}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <FieldError id="name-error" message={fieldErrors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="organizationName">Organization</Label>
          <Input
            id="organizationName"
            autoComplete="organization"
            value={organizationName}
            aria-invalid={Boolean(fieldErrors.organizationName)}
            aria-describedby={fieldErrors.organizationName ? 'organizationName-error' : undefined}
            onChange={(event) => {
              setOrganizationName(event.target.value);
            }}
          />
          <FieldError id="organizationName-error" message={fieldErrors.organizationName} />
        </div>
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
            autoComplete="new-password"
            value={password}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          <FieldError id="password-error" message={fieldErrors.password} />
          <p className="text-xs leading-5 text-slate-500">
            At least 10 characters, including a letter and a number.
          </p>
        </div>
        <Button type="submit" className="w-full" loading={submitting} loadingLabel="Please wait…">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
