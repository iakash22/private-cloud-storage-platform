import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicShareAccess } from '@vaultstack/types';
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
import { parseForm, unlockShareBodySchema } from '@vaultstack/validation';
import { apiClient } from '../lib/api.js';
import { useAuth } from '../context/auth-context.js';
import { useFormSubmit } from '../lib/form-errors.js';

export function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const { loading: authLoading } = useAuth();
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | undefined>();
  const [share, setShare] = useState<PublicShareAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    void apiClient
      .inspectPublicShare(token)
      .then((result) => {
        setPasswordRequired(result.passwordRequired);
        setShare(result.share);
      })
      .catch((caught: unknown) => {
        catchError(caught);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [catchError, token]);

  const handleUnlock = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!token) {
      return;
    }
    const body = validate(parseForm(unlockShareBodySchema, { password }));
    if (!body) {
      return;
    }
    try {
      const result = await apiClient.unlockPublicShare(token, body.password);
      setAccessToken(result.accessToken);
      setShare(result.share);
      setPasswordRequired(false);
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDownload = async (): Promise<void> => {
    if (!token) {
      return;
    }
    setDownloading(true);
    try {
      const download = await apiClient.createPublicShareDownloadUrl(token, {
        password: password || undefined,
        accessToken,
      });
      window.location.assign(download.url);
    } catch (caught) {
      catchError(caught);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Shared file</CardTitle>
          <CardDescription>
            VaultStack issues a short-lived download. Storage paths and credentials stay private.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading || authLoading ? <p className="text-sm text-slate-500">Loading share…</p> : null}

          {passwordRequired && !share ? (
            <form className="space-y-4" onSubmit={(event) => void handleUnlock(event)}>
              <div className="space-y-2">
                <Label htmlFor="share-unlock-password">Password</Label>
                <Input
                  id="share-unlock-password"
                  type="password"
                  value={password}
                  aria-invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  required
                />
                <FieldError message={fieldErrors.password} />
              </div>
              <Button type="submit" disabled={authLoading}>
                Unlock
              </Button>
            </form>
          ) : null}

          {share ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{share.fileName}</p>
                <p className="text-sm text-slate-500">
                  {share.contentType} · {share.size} bytes
                  {share.expiresAt
                    ? ` · expires ${new Date(share.expiresAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              {share.allowDownload ? (
                <Button
                  type="button"
                  disabled={downloading || authLoading}
                  onClick={() => void handleDownload()}
                >
                  {downloading ? 'Preparing…' : 'Download'}
                </Button>
              ) : (
                <p className="text-sm text-slate-500">This share is view-only.</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
