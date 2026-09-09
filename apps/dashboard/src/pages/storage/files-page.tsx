import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BucketSelector,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeleteConfirmation,
  Dialog,
  DialogActions,
  FieldError,
  FileExplorer,
  formatBytes,
  formatDate,
  Input,
  Label,
  ObjectDetails,
  ShareDialog,
  type ExplorerEntry,
  type ShareDialogCreateInput,
  type SortDirection,
  type SortField,
  type ViewMode,
} from '@vaultstack/ui';
import type { PublicObjectVersion, PublicTeam } from '@vaultstack/types';
import { createShareBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { useObjectList, useSelectedObject, useBuckets } from '../../hooks/use-storage.js';
import { useUploadQueue } from '../../hooks/use-upload-queue.js';
import { apiClient } from '../../lib/api.js';
import { useFormSubmit } from '../../lib/form-errors.js';
import {
  addTrashItem,
  buildObjectKey,
  canDeleteStorage,
  canReadStorage,
  canShareStorage,
  canUploadStorage,
  getFavoriteIds,
  getSelectedBucketId,
  recordRecentFile,
  setSelectedBucketId,
  toggleFavorite,
} from '../../lib/storage-preferences.js';

export function FilesPage() {
  const { permissions, activeOrganizationId } = useAuth();
  const { fieldErrors, validate, catchError, clearFieldErrors } = useFormSubmit();
  const [searchParams, setSearchParams] = useSearchParams();
  const { buckets, loading: bucketsLoading } = useBuckets();
  const [bucketId, setBucketId] = useState<string | undefined>(
    searchParams.get('bucket') ?? getSelectedBucketId(),
  );
  const [prefix, setPrefix] = useState(searchParams.get('prefix') ?? '');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedEntry, setSelectedEntry] = useState<ExplorerEntry | undefined>();
  const [favoriteIds, setFavoriteIds] = useState(getFavoriteIds());
  const [showUploader, setShowUploader] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerEntry | undefined>();
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | undefined>();
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<ExplorerEntry | undefined>();
  const [moveBucketId, setMoveBucketId] = useState('');
  const [moveKey, setMoveKey] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [versions, setVersions] = useState<PublicObjectVersion[]>([]);

  const { page, loading, error, refresh, loadMore } = useObjectList(bucketId, prefix);
  const selectedObjectId = selectedEntry?.kind === 'file' ? selectedEntry.id : undefined;
  const { object } = useSelectedObject(selectedObjectId);
  const { uploads, enqueueFiles, cancelUpload, retryUpload, pauseUpload, resumeUpload } =
    useUploadQueue({
      onComplete: () => {
        void refresh();
      },
    });

  const selectedBucket = useMemo(
    () => buckets.find((bucket) => bucket.id === bucketId),
    [buckets, bucketId],
  );

  useEffect(() => {
    if (!selectedObjectId || selectedBucket?.versioning === 'UNVERSIONED') {
      setVersions([]);
      return;
    }

    let cancelled = false;
    void apiClient
      .listObjectVersions(selectedObjectId)
      .then((versionPage) => {
        if (!cancelled) {
          setVersions(versionPage.versions ?? []);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setVersions([]);
          catchError(caught);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catchError, selectedObjectId, selectedBucket?.versioning]);

  useEffect(() => {
    if (!bucketId && buckets[0]?.id) {
      setBucketId(buckets[0].id);
    }
  }, [bucketId, buckets]);

  useEffect(() => {
    if (!bucketId) {
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set('bucket', bucketId);
    if (prefix) {
      next.set('prefix', prefix);
    } else {
      next.delete('prefix');
    }
    setSearchParams(next, { replace: true });
    setSelectedBucketId(bucketId);
  }, [bucketId, prefix, searchParams, setSearchParams]);

  const handleOpen = (entry: ExplorerEntry) => {
    if (entry.kind === 'folder') {
      setPrefix(entry.key);
      setSelectedEntry(undefined);
      return;
    }

    setSelectedEntry(entry);
    if (bucketId) {
      recordRecentFile({
        id: entry.id,
        bucketId,
        key: entry.key,
        name: entry.name,
      });
    }
  };

  const handleDownload = async (entry: ExplorerEntry, versionId?: string) => {
    try {
      const download = await apiClient.createDownloadUrl(entry.id, { versionId });
      window.open(download.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedObjectId) {
      return;
    }
    try {
      await apiClient.restoreObjectVersion(selectedObjectId, versionId);
      const versionPage = await apiClient.listObjectVersions(selectedObjectId);
      setVersions(versionPage.versions);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!selectedObjectId) {
      return;
    }
    try {
      await apiClient.deleteObjectVersion(selectedObjectId, versionId);
      const versionPage = await apiClient.listObjectVersions(selectedObjectId);
      setVersions(versionPage.versions);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      await apiClient.deleteObject(deleteTarget.id);
      addTrashItem({
        id: deleteTarget.id,
        bucketId: bucketId ?? '',
        key: deleteTarget.key,
        name: deleteTarget.name,
        size: deleteTarget.size ?? 0,
      });
      setDeleteTarget(undefined);
      setSelectedEntry(undefined);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !bucketId || !renameValue.trim()) {
      return;
    }

    try {
      const destinationKey = buildObjectKey(prefix, renameValue.trim());
      await apiClient.moveObject(renameTarget.id, {
        destinationBucketId: bucketId,
        destinationKey,
      });
      setRenameTarget(undefined);
      setRenameValue('');
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleMove = async () => {
    if (!moveTarget || !moveBucketId || !moveKey.trim()) {
      return;
    }

    try {
      await apiClient.moveObject(moveTarget.id, {
        destinationBucketId: moveBucketId,
        destinationKey: moveKey.trim(),
      });
      setMoveTarget(undefined);
      setMoveKey('');
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleCopy = async (entry: ExplorerEntry) => {
    if (!bucketId) {
      return;
    }

    try {
      await apiClient.copyObject(entry.id, {
        destinationBucketId: bucketId,
        destinationKey: `${entry.key}.copy`,
      });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Files</h2>
          <p className="text-sm text-slate-500">
            Browse, upload, and manage objects by bucket and prefix.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <BucketSelector
            buckets={buckets}
            value={bucketId}
            disabled={bucketsLoading}
            onChange={setBucketId}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <FileExplorer
            prefix={prefix}
            page={page}
            loading={loading || bucketsLoading}
            error={error ?? undefined}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            search={search}
            onSearchChange={setSearch}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortFieldChange={setSortField}
            onSortDirectionChange={setSortDirection}
            selectedId={selectedEntry?.id}
            favoriteIds={favoriteIds}
            onNavigatePrefix={setPrefix}
            onSelect={setSelectedEntry}
            onOpen={handleOpen}
            onDownload={
              canReadStorage(permissions)
                ? (entry) => {
                    void handleDownload(entry);
                  }
                : undefined
            }
            onRename={
              canUploadStorage(permissions)
                ? (entry) => {
                    if (entry.kind !== 'file') {
                      return;
                    }
                    setRenameTarget(entry);
                    setRenameValue(entry.name);
                  }
                : undefined
            }
            onDelete={canDeleteStorage(permissions) ? setDeleteTarget : undefined}
            onToggleFavorite={(entry) => {
              if (entry.kind !== 'file') {
                return;
              }
              setFavoriteIds(toggleFavorite(entry.id));
            }}
            onUploadClick={() => {
              setShowUploader((current) => !current);
            }}
            onFilesSelected={(files) => {
              if (!bucketId || !canUploadStorage(permissions)) {
                return;
              }
              enqueueFiles(files, bucketId, prefix);
            }}
            uploads={uploads}
            onCancelUpload={(uploadId) => {
              cancelUpload(uploadId);
            }}
            onRetryUpload={retryUpload}
            onPauseUpload={pauseUpload}
            onResumeUpload={resumeUpload}
            onRetry={() => {
              void refresh();
            }}
            uploadDisabled={!bucketId || !canUploadStorage(permissions)}
            showUploader={showUploader}
          />

          {page?.isTruncated ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadMore()}
              disabled={!page.nextCursor}
            >
              Load more
            </Button>
          ) : null}
        </div>

        <div className="space-y-4">
          <ObjectDetails object={object} bucket={selectedBucket} />
          {selectedEntry?.kind === 'file' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownload(selectedEntry)}
              >
                Download
              </Button>
              {canUploadStorage(permissions) ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCopy(selectedEntry)}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMoveTarget(selectedEntry);
                      setMoveBucketId(bucketId ?? '');
                      setMoveKey(selectedEntry.key);
                    }}
                  >
                    Move
                  </Button>
                </>
              ) : null}
              {canShareStorage(permissions) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    clearFieldErrors();
                    setShareUrl(null);
                    setShareOpen(true);
                    if (activeOrganizationId) {
                      void apiClient
                        .listTeams(activeOrganizationId)
                        .then(setTeams)
                        .catch(() => {
                          setTeams([]);
                        });
                    }
                  }}
                >
                  Share
                </Button>
              ) : null}
            </div>
          ) : null}
          {selectedEntry?.kind === 'file' && selectedBucket?.versioning !== 'UNVERSIONED' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {versions.length === 0 ? (
                  <p className="text-sm text-slate-500">No versions recorded for this object.</p>
                ) : (
                  versions.map((version) => (
                    <div
                      key={version.versionId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">
                          {version.isDeleteMarker ? 'Delete marker' : formatBytes(version.size)}
                          {version.isCurrent ? ' · current' : ''}
                        </p>
                        <p className="text-xs text-slate-500">{formatDate(version.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!version.isDeleteMarker && selectedEntry ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDownload(selectedEntry, version.versionId)}
                          >
                            Download
                          </Button>
                        ) : null}
                        {canUploadStorage(permissions) && !version.isDeleteMarker && !version.isCurrent ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRestoreVersion(version.versionId)}
                          >
                            Restore
                          </Button>
                        ) : null}
                        {canDeleteStorage(permissions) && !version.isCurrent ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDeleteVersion(version.versionId)}
                          >
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <DeleteConfirmation
        open={Boolean(deleteTarget)}
        title="Delete object"
        description={`Delete "${deleteTarget?.name}" from this bucket?`}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined);
          }
        }}
        onConfirm={() => void handleDelete()}
      />

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(undefined);
          }
        }}
        title="Rename object"
        description="Renaming moves the object to a new key in the same bucket."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Rename"
            onCancel={() => {
              setRenameTarget(undefined);
            }}
            onConfirm={() => void handleRename()}
          />
        }
      >
        <div className="space-y-2">
          <Label htmlFor="rename-value">New name</Label>
          <Input
            id="rename-value"
            value={renameValue}
            aria-invalid={Boolean(fieldErrors.destinationKey)}
            onChange={(event) => {
              setRenameValue(event.target.value);
            }}
          />
          <FieldError message={fieldErrors.destinationKey} />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(moveTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setMoveTarget(undefined);
          }
        }}
        title="Move object"
        description="Move this object to another bucket or key."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Move"
            onCancel={() => {
              setMoveTarget(undefined);
            }}
            onConfirm={() => void handleMove()}
          />
        }
      >
        <div className="space-y-3">
          <BucketSelector buckets={buckets} value={moveBucketId} onChange={setMoveBucketId} />
          <FieldError message={fieldErrors.destinationBucketId} />
          <div className="space-y-2">
            <Label htmlFor="move-key">Destination key</Label>
            <Input
              id="move-key"
              value={moveKey}
              aria-invalid={Boolean(fieldErrors.destinationKey)}
              onChange={(event) => {
                setMoveKey(event.target.value);
              }}
            />
            <FieldError message={fieldErrors.destinationKey} />
          </div>
        </div>
      </Dialog>

      <ShareDialog
        open={shareOpen}
        objectName={selectedEntry?.name}
        teams={teams}
        submitting={shareSubmitting}
        fieldErrors={fieldErrors}
        createdUrl={shareUrl}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setShareUrl(null);
            clearFieldErrors();
          }
        }}
        onCreate={(input: ShareDialogCreateInput) => {
          if (!selectedEntry) {
            return;
          }
          const body = validate(parseForm(createShareBodySchema, input));
          if (!body) {
            return;
          }
          setShareSubmitting(true);
          void apiClient
            .createShare(selectedEntry.id, body)
            .then((share) => {
              setShareUrl(`${window.location.origin}/s/${share?.token ?? ''}`);
            })
            .catch((caught: unknown) => {
              catchError(caught);
            })
            .finally(() => {
              setShareSubmitting(false);
            });
        }}
      />
    </div>
  );
}
