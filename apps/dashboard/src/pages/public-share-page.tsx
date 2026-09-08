import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiClientError } from '@vaultstack/api-client';
import type { PublicShareAccess } from '@vaultstack/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@vaultstack/ui';
import { apiClient } from '../lib/api.js';
import { useAuth } from '../context/auth-context.js';

export function PublicSharePage() {
  const { token } = useParams<{ token: string }>();
  const { loading: authLoading } = useAuth();
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | undefined>();
  const [share, setShare] = useState<PublicShareAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    void apiClient
      .inspectPublicShare(token)
      .then((result) => {
        setPasswordRequired(result.passwordRequired);
        setShare(result.share);
      })
      .catch((caught: unknown) => {
        setError(messageOf(caught));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleUnlock = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!token) {
      return;
    }
    setError(null);
    try {
      const result = await apiClient.unlockPublicShare(token, password);
      setAccessToken(result.accessToken);
      setShare(result.share);
      setPasswordRequired(false);
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const handleDownload = async (): Promise<void> => {
    if (!token) {
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const download = await apiClient.createPublicShareDownloadUrl(token, {
        password: password || undefined,
        accessToken,
      });
      window.location.assign(download.url);
    } catch (caught) {
      setError(messageOf(caught));
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
          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {passwordRequired && !share ? (
            <form className="space-y-4" onSubmit={(event) => void handleUnlock(event)}>
              <div className="space-y-2">
                <Label htmlFor="share-unlock-password">Password</Label>
                <Input
                  id="share-unlock-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  required
                />
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

function messageOf(caught: unknown): string {
  if (caught instanceof ApiClientError) {
    return caught.message;
  }
  return caught instanceof Error ? caught.message : 'Unable to open this share';
}
