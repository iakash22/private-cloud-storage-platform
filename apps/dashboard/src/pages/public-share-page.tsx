import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import hljs from 'highlight.js/lib/common';
import type { PublicShareAccess } from '@vaultstack/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  formatBytes,
  Input,
  Label,
  PasswordInput,
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
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [previewText, setPreviewText] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [remaining, setRemaining] = useState<string>();
  const previewRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!token || !share?.allowView) {
      setPreviewUrl(undefined);
      setPreviewText(undefined);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(undefined);
    void apiClient
      .createPublicSharePreviewUrl(token, {
        password: password || undefined,
        accessToken,
      })
      .then(async (preview) => {
        if (cancelled) {
          return;
        }
        setPreviewUrl(preview.url);
        if (isTextPreview(share.contentType, share.fileName)) {
          const response = await fetch(preview.url);
          if (!response.ok) {
            throw new Error('Unable to load file preview');
          }
          const text = await response.text();
          if (!cancelled) {
            setPreviewText(text);
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setPreviewError(caught instanceof Error ? caught.message : 'Preview unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, password, share, token]);

  useEffect(() => {
    if (!share?.expiresAt) {
      setRemaining('No expiry');
      return;
    }
    const update = () => {
      const milliseconds = new Date(share.expiresAt!).getTime() - Date.now();
      if (milliseconds <= 0) {
        setRemaining('Expired');
        return;
      }
      const totalSeconds = Math.floor(milliseconds / 1_000);
      const days = Math.floor(totalSeconds / 86_400);
      const hours = Math.floor((totalSeconds % 86_400) / 3_600);
      const minutes = Math.floor((totalSeconds % 3_600) / 60);
      const seconds = totalSeconds % 60;
      setRemaining(
        days > 0
          ? `${days}d ${hours}h ${minutes}m`
          : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      );
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [share?.expiresAt]);

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
    <main className="min-h-screen bg-slate-950 px-3 py-3 sm:px-6 sm:py-6">
      <Helmet>
        <title>
          {share?.fileName ? `${share.fileName} · Shared file` : 'Shared file'} · VaultStack
        </title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="mx-auto w-full max-w-7xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-white sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Shared file</CardTitle>
            <CardDescription>
              VaultStack issues a short-lived download. Storage paths and credentials stay private.
            </CardDescription>
          </div>
          {share ? (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-right text-xs text-slate-600">
              <p className="font-medium text-slate-900">{remaining}</p>
              <p>share expires</p>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5 p-3 sm:p-6">
          {loading || authLoading ? <p className="text-sm text-slate-500">Loading share…</p> : null}

          {passwordRequired && !share ? (
            <form className="space-y-4" onSubmit={(event) => void handleUnlock(event)}>
              <div className="space-y-2">
                <Label htmlFor="share-unlock-password">Password</Label>
                <PasswordInput
                  id="share-unlock-password"
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
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{share.fileName}</p>
                  <p className="text-sm text-slate-500">
                    {share.contentType} · {share.size} bytes
                    {share.expiresAt
                      ? ` · expires ${new Date(share.expiresAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                {share.allowView ? (
                  <div ref={previewRef} className="rounded-xl bg-slate-950 p-2 shadow-inner sm:p-4">
                    <SharePreview
                      contentType={share.contentType}
                      fileName={share.fileName}
                      previewUrl={previewUrl}
                      previewText={previewText}
                      loading={previewLoading}
                      error={previewError}
                    />
                  </div>
                ) : null}
              </div>
              <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Share details
                </p>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-slate-500">File</dt>
                    <dd className="break-all font-medium text-slate-900">{share.fileName}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Type</dt>
                    <dd className="break-all text-slate-700">{share.contentType}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Size</dt>
                    <dd className="text-slate-700">{formatBytes(share.size)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Access</dt>
                    <dd className="text-slate-700">
                      {share.allowView ? 'View' : ''}
                      {share.allowView && share.allowDownload ? ' + ' : ''}
                      {share.allowDownload ? 'Download' : ''}
                    </dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void previewRef.current?.requestFullscreen?.();
                  }}
                  disabled={!share.allowView || !previewUrl}
                >
                  Full-screen preview
                </Button>
              </aside>
              <div className="lg:col-start-2">
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
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

function SharePreview({
  contentType,
  fileName,
  previewUrl,
  previewText,
  loading,
  error,
}: {
  contentType: string;
  fileName: string;
  previewUrl?: string;
  previewText?: string;
  loading: boolean;
  error?: string;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Preparing preview…</p>;
  }
  if (error || !previewUrl) {
    return (
      <p className="text-sm text-slate-500">{error ?? 'Preview unavailable for this file type.'}</p>
    );
  }
  if (contentType.startsWith('image/')) {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        <img
          src={previewUrl}
          alt={fileName}
          className="max-h-[min(60vh,32rem)] w-full object-contain"
        />
      </div>
    );
  }
  if (contentType.startsWith('video/')) {
    return (
      <video
        className="max-h-[min(60vh,32rem)] w-full rounded-lg bg-black"
        controls
        src={previewUrl}
      />
    );
  }
  if (contentType.startsWith('audio/')) {
    return <audio className="w-full" controls src={previewUrl} />;
  }
  if (contentType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    return (
      <iframe
        title={`Preview of ${fileName}`}
        src={previewUrl}
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        className="h-[min(60vh,32rem)] w-full rounded-lg border border-slate-200"
      />
    );
  }
  if (previewText !== undefined) {
    const highlighted = hljs.highlightAuto(previewText).value;
    return (
      <pre
        className="hljs max-h-[min(60vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-4 text-xs"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    );
  }
  return <p className="text-sm text-slate-500">This file type can be viewed after downloading.</p>;
}

function isTextPreview(contentType: string, fileName: string): boolean {
  return (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    /\.(csv|md|log|json|xml|yaml|yml|txt)$/i.test(fileName)
  );
}
