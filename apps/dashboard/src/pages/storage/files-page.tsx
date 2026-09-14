import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BucketSelector,
  Button,
  Card,
  CardContent,
  CardDescription,
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
  PageHeader,
  Select,
  ShareDialog,
  type ExplorerEntry,
  type ShareDialogCreateInput,
  type SortDirection,
  type SortField,
  type ViewMode,
} from '@vaultstack/ui';
import { FolderOpen } from 'lucide-react';
import type {
  PublicFolderOperationJob,
  PublicObjectListFilters,
  PublicObjectVersion,
  PublicTeam,
} from '@vaultstack/types';
import { createFolderBodySchema, createShareBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { useObjectList, useSelectedObject, useBuckets } from '../../hooks/use-storage.js';
import { useUploadQueue } from '../../hooks/use-upload-queue.js';
import { apiClient } from '../../lib/api.js';
import { useFormSubmit } from '../../lib/form-errors.js';
import { useRealtimeSubscription } from '../../hooks/use-realtime-subscription.js';
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
  const pendingPrefixRef = useRef<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [filters, setFilters] = useState<PublicObjectListFilters>(() => ({
    contentType: searchParams.get('contentType') ?? undefined,
    minSize: parseOptionalNumber(searchParams.get('minSize')),
    maxSize: parseOptionalNumber(searchParams.get('maxSize')),
    externallyShared: parseOptionalBoolean(searchParams.get('externallyShared')),
    versioned: parseOptionalBoolean(searchParams.get('versioned')),
    processingState: searchParams.get('processingState') ?? undefined,
    folderPrefix: searchParams.get('folderPrefix') ?? undefined,
    tag: searchParams.get('tag') ?? undefined,
    modifiedFrom: searchParams.get('modifiedFrom') ?? undefined,
    modifiedTo: searchParams.get('modifiedTo') ?? undefined,
  }));
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedEntry, setSelectedEntry] = useState<ExplorerEntry | undefined>();
  const [favoriteIds, setFavoriteIds] = useState(getFavoriteIds());
  const [showUploader, setShowUploader] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
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
  const [operationJob, setOperationJob] = useState<PublicFolderOperationJob>();
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataDescription, setMetadataDescription] = useState('');
  const [metadataTags, setMetadataTags] = useState('');

  const { page, loading, error, refresh, loadMore } = useObjectList(
    bucketId,
    prefix,
    search,
    filters,
  );
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
    const metadata = object?.metadata;
    setMetadataDescription(metadata?.description ?? '');
    try {
      const parsed = metadata?.tags ? (JSON.parse(metadata.tags) as unknown) : [];
      setMetadataTags(
        Array.isArray(parsed)
          ? parsed.filter((tag): tag is string => typeof tag === 'string').join(', ')
          : '',
      );
    } catch {
      setMetadataTags('');
    }
  }, [object]);

  const handleSaveMetadata = async (): Promise<void> => {
    if (!object) {
      return;
    }
    try {
      await apiClient.updateObjectMetadata(object.id, {
        description: metadataDescription.trim() || null,
        tags: metadataTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setMetadataOpen(false);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

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
          setVersions(versionPage.versions);
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
    const nextBucketId = searchParams.get('bucket');
    const nextPrefix = searchParams.get('prefix') ?? '';
    // Only mirror an explicit ?bucket= value into state. Treating a missing
    // query param as "clear selection" races with local Select changes before
    // the outbound sync effect can write the URL, which drops bucketId mid-upload.
    if (nextBucketId && nextBucketId !== bucketId) {
      setBucketId(nextBucketId);
    }
    if (pendingPrefixRef.current !== null) {
      if (pendingPrefixRef.current === nextPrefix) {
        pendingPrefixRef.current = null;
      }
      return;
    }
    if (nextPrefix !== prefix) {
      setPrefix(nextPrefix);
    }
  }, [bucketId, prefix, searchParams]);

  const navigatePrefix = useCallback((nextPrefix: string) => {
    pendingPrefixRef.current = nextPrefix;
    setPrefix(nextPrefix);
    setSelectedEntry(undefined);
  }, []);

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

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search.trim()) {
      next.set('search', search.trim());
    } else {
      next.delete('search');
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    setSearchParams(next, { replace: true });
  }, [filters, search, searchParams, setSearchParams]);

  const refreshOperationJob = useCallback(async () => {
    if (!operationJob) {
      return;
    }
    try {
      const next = await apiClient.getFolderOperation(operationJob.id);
      setOperationJob(next);
    } catch (caught: unknown) {
      catchError(caught);
    }
  }, [catchError, operationJob]);

  useRealtimeSubscription(
    ['folder_operation.progress', 'folder_operation.completed', 'folder_operation.failed'],
    (event) => {
      if (!operationJob) {
        return;
      }
      const payload = event.payload as { jobId?: string };
      if (payload.jobId !== operationJob.id) {
        return;
      }
      void refreshOperationJob();
    },
  );

  useEffect(() => {
    if (!operationJob || !['QUEUED', 'RUNNING', 'PAUSED'].includes(operationJob.status)) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshOperationJob();
    }, 15_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [operationJob, refreshOperationJob]);

  const handleCreateFolder = async (): Promise<void> => {
    if (!bucketId || !canUploadStorage(permissions)) {
      return;
    }
    const body = validate(
      parseForm(createFolderBodySchema, {
        name: folderName,
        parentPrefix: prefix,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createFolder(bucketId, body);
      setCreateFolderOpen(false);
      setFolderName('');
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleOpen = (entry: ExplorerEntry) => {
    if (entry.kind === 'folder') {
      navigatePrefix(entry.key);
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
      if (deleteTarget.kind === 'folder' && bucketId) {
        const job = await apiClient.createFolderOperation({
          bucketId,
          operation: 'DELETE',
          sourcePrefix: deleteTarget.key,
        });
        setOperationJob(job);
        setDeleteTarget(undefined);
        await refresh();
        return;
      }
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
      if (renameTarget.kind === 'folder') {
        const destinationPrefix = `${buildObjectKey(prefix, renameValue.trim())}/`;
        const job = await apiClient.createFolderOperation({
          bucketId,
          operation: 'MOVE',
          sourcePrefix: renameTarget.key,
          destinationPrefix,
        });
        setOperationJob(job);
        setRenameTarget(undefined);
        setRenameValue('');
        await refresh();
        return;
      }
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
      <PageHeader
        title="Files"
        description="Browse, upload, and manage objects by bucket and prefix."
        icon={<FolderOpen className="h-5 w-5" aria-hidden="true" />}
        actions={
          <div className="w-full min-w-[14rem] sm:w-64">
            <BucketSelector
              buckets={buckets}
              value={bucketId}
              disabled={bucketsLoading}
              onChange={setBucketId}
            />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advanced filters</CardTitle>
              <CardDescription>
                Narrow results by type, size, sharing, version, or processing state.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Input
                aria-label="Content type filter"
                placeholder="Content type"
                value={filters.contentType ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    contentType: event.target.value || undefined,
                  })); }
                }
              />
              <Input
                aria-label="Minimum size filter"
                type="number"
                min={0}
                placeholder="Min bytes"
                value={filters.minSize ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    minSize: parseOptionalNumber(event.target.value),
                  })); }
                }
              />
              <Input
                aria-label="Maximum size filter"
                type="number"
                min={0}
                placeholder="Max bytes"
                value={filters.maxSize ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    maxSize: parseOptionalNumber(event.target.value),
                  })); }
                }
              />
              <Select
                aria-label="Sharing filter"
                value={
                  filters.externallyShared === undefined
                    ? ''
                    : filters.externallyShared
                      ? 'shared'
                      : 'private'
                }
                onChange={(value) => { setFilters((current) => ({
                    ...current,
                    externallyShared: value === '' ? undefined : value === 'shared',
                  })); }
                }
                options={[
                  { value: '', label: 'All sharing states' },
                  { value: 'shared', label: 'Externally shared' },
                  { value: 'private', label: 'Not externally shared' },
                ]}
              />
              <Select
                aria-label="Version filter"
                value={
                  filters.versioned === undefined
                    ? ''
                    : filters.versioned
                      ? 'versioned'
                      : 'unversioned'
                }
                onChange={(value) => { setFilters((current) => ({
                    ...current,
                    versioned: value === '' ? undefined : value === 'versioned',
                  })); }
                }
                options={[
                  { value: '', label: 'All version states' },
                  { value: 'versioned', label: 'Versioned' },
                  { value: 'unversioned', label: 'Unversioned' },
                ]}
              />
              <Input
                aria-label="Processing state filter"
                placeholder="Processing state"
                value={filters.processingState ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    processingState: event.target.value || undefined,
                  })); }
                }
              />
              <Input
                aria-label="Folder prefix filter"
                placeholder="Folder prefix"
                value={filters.folderPrefix ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    folderPrefix: event.target.value || undefined,
                  })); }
                }
              />
              <Input
                aria-label="Tag filter"
                placeholder="Tag"
                value={filters.tag ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    tag: event.target.value || undefined,
                  })); }
                }
              />
              <Input
                aria-label="Modified from filter"
                type="date"
                value={filters.modifiedFrom?.slice(0, 10) ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    modifiedFrom: event.target.value
                      ? `${event.target.value}T00:00:00.000Z`
                      : undefined,
                  })); }
                }
              />
              <Input
                aria-label="Modified to filter"
                type="date"
                value={filters.modifiedTo?.slice(0, 10) ?? ''}
                onChange={(event) => { setFilters((current) => ({
                    ...current,
                    modifiedTo: event.target.value
                      ? `${event.target.value}T23:59:59.999Z`
                      : undefined,
                  })); }
                }
              />
            </CardContent>
          </Card>
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
            onNavigatePrefix={navigatePrefix}
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
            onCreateFolder={() => {
              clearFieldErrors();
              setFolderName('');
              setCreateFolderOpen(true);
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
          {object && canUploadStorage(permissions) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMetadataOpen(true);
              }}
            >
              Edit description and tags
            </Button>
          ) : null}
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
                        {!version.isDeleteMarker ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDownload(selectedEntry, version.versionId)}
                          >
                            Download
                          </Button>
                        ) : null}
                        {canUploadStorage(permissions) &&
                        !version.isDeleteMarker &&
                        !version.isCurrent ? (
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
        title={deleteTarget?.kind === 'folder' ? 'Delete folder' : 'Delete object'}
        description={`${deleteTarget?.kind === 'folder' ? 'Delete all contents of' : 'Delete'} "${deleteTarget?.name}" from this bucket?`}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(undefined);
          }
        }}
        onConfirm={() => void handleDelete()}
      />

      <Dialog
        open={metadataOpen}
        onOpenChange={setMetadataOpen}
        title="Edit metadata"
        description="Add searchable description and comma-separated tags."
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Save"
            onCancel={() => {
              setMetadataOpen(false);
            }}
            onConfirm={() => void handleSaveMetadata()}
          />
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="object-description">Description</Label>
            <Input
              id="object-description"
              value={metadataDescription}
              onChange={(event) => {
                setMetadataDescription(event.target.value);
              }}
              placeholder="What is this file used for?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="object-tags">Tags</Label>
            <Input
              id="object-tags"
              value={metadataTags}
              onChange={(event) => {
                setMetadataTags(event.target.value);
              }}
              placeholder="finance, 2026, report"
            />
          </div>
        </div>
      </Dialog>

      {operationJob ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Folder operation</CardTitle>
            <CardDescription>
              {operationJob.operation} · {operationJob.status.toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="truncate">{operationJob.sourcePrefix}</span>
              <span>
                {operationJob.processedObjects}
                {operationJob.totalObjects === null ? '' : ` / ${operationJob.totalObjects}`}
              </span>
            </div>
            {operationJob.error ? (
              <p className="text-sm text-red-600">{operationJob.error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {['QUEUED', 'RUNNING', 'PAUSED'].includes(operationJob.status) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void apiClient.cancelFolderOperation(operationJob.id).then(() => {
                      setOperationJob((current) =>
                        current ? { ...current, status: 'CANCELLED' } : current,
                      );
                    });
                  }}
                >
                  Cancel
                </Button>
              ) : null}
              {operationJob.status === 'FAILED' ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    void apiClient.retryFolderOperation(operationJob.id).then(setOperationJob);
                  }}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        title="Create folder"
        description={`Create a folder inside ${prefix || 'the bucket root'}.`}
        footer={
          <DialogActions
            cancelLabel="Cancel"
            confirmLabel="Create folder"
            onCancel={() => {
              setCreateFolderOpen(false);
            }}
            onConfirm={() => void handleCreateFolder()}
          />
        }
      >
        <div className="space-y-2">
          <Label htmlFor="folder-name">Folder name</Label>
          <Input
            id="folder-name"
            value={folderName}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => {
              setFolderName(event.target.value);
            }}
            placeholder="Reports"
            autoFocus
          />
          <FieldError message={fieldErrors.name} />
        </div>
      </Dialog>

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
              setShareUrl(`${window.location.origin}/s/${share.token}`);
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

function parseOptionalNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}
