import { useEffect, useState } from 'react';
import type { PublicShareLink } from '@vaultstack/types';
import { Badge, Button, EmptyState, formatDate } from '@vaultstack/ui';
import { apiClient } from '../../lib/api.js';
import { canShareStorage } from '../../lib/storage-preferences.js';
import { useAuth } from '../../context/auth-context.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function SharesPage() {
  const { permissions } = useAuth();
  const { catchError } = useFormSubmit();
  const [shares, setShares] = useState<PublicShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setShares(await apiClient.listShares());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canShareStorage(permissions)) {
      void load();
    } else {
      setLoading(false);
    }
  }, [permissions]);

  if (!canShareStorage(permissions)) {
    return (
      <EmptyState
        title="Sharing is restricted"
        description="Your role does not include storage.share, so you cannot manage share links."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Shares</h2>
        <p className="text-sm text-slate-500">
          Revoke links, adjust expiration, and review download permissions. Tokens are never shown
          again after creation.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading shares…</p> : null}

      {!loading && shares.length === 0 ? (
        <EmptyState
          title="No share links yet"
          description="Use the Share action on a file to create a time-limited link."
        />
      ) : null}

      {shares.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">File</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Permissions</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Downloads</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => {
                const expired = share.expiresAt
                  ? new Date(share.expiresAt).getTime() <= Date.now()
                  : false;
                const revoked = Boolean(share.revokedAt);
                return (
                  <tr key={share.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{share.fileName}</div>
                      <div className="text-xs text-slate-500">{share.tokenPrefix}…</div>
                    </td>
                    <td className="px-4 py-3">
                      {share.visibility.toLowerCase().replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      {share.allowView ? 'View' : null}
                      {share.allowView && share.allowDownload ? ' · ' : null}
                      {share.allowDownload ? 'Download' : null}
                      {share.hasPassword ? ' · Password' : null}
                    </td>
                    <td className="px-4 py-3">
                      {share.expiresAt ? formatDate(share.expiresAt) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      {share.accessCount}
                      {share.maxDownloads !== null ? ` / ${share.maxDownloads}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {revoked ? (
                        <Badge>Revoked</Badge>
                      ) : expired ? (
                        <Badge>Expired</Badge>
                      ) : (
                        <Badge>Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {revoked ? null : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const next = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                              void apiClient
                                .updateShare(share.id, { expiresAt: next })
                                .then(() => void load())
                                .catch((caught: unknown) => {
                                  catchError(caught);
                                });
                            }}
                          >
                            Extend 24h
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void apiClient
                                .updateShare(share.id, { allowDownload: !share.allowDownload })
                                .then(() => void load())
                                .catch((caught: unknown) => {
                                  catchError(caught);
                                });
                            }}
                          >
                            {share.allowDownload ? 'Disable download' : 'Allow download'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void apiClient
                                .revokeShare(share.id)
                                .then(() => void load())
                                .catch((caught: unknown) => {
                                  catchError(caught);
                                });
                            }}
                          >
                            Revoke
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
