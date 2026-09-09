import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  ArtifactKindName,
  BuildStatusName,
  PublicArtifact,
  PublicArtifactVersion,
  PublicBuild,
  PublicProject,
} from '@vaultstack/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmation,
  Dialog,
  DialogActions,
  EmptyState,
  FieldError,
  formatBytes,
  formatDate,
  Input,
  Label,
} from '@vaultstack/ui';
import { createBuildBodySchema, initiateArtifactBodySchema, parseForm, updateProjectBodySchema } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import {
  canDeleteArtifacts,
  canUploadArtifacts,
} from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

const BUILD_STATUSES: BuildStatusName[] = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
];

const ARTIFACT_KINDS: ArtifactKindName[] = [
  'GENERIC',
  'PACKAGE',
  'LOG',
  'ARCHIVE',
  'RELEASE',
  'BUNDLE',
];

export function ArtifactsProjectPage() {
  const { projectId = '' } = useParams();
  const { permissions } = useAuth();
  const canUpload = canUploadArtifacts(permissions);
  const canDelete = canDeleteArtifacts(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [project, setProject] = useState<PublicProject | null>(null);
  const [builds, setBuilds] = useState<PublicBuild[]>([]);
  const [artifacts, setArtifacts] = useState<PublicArtifact[]>([]);
  const [releases, setReleases] = useState<PublicArtifactVersion[]>([]);
  const [selectedBuildId, setSelectedBuildId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteBuildId, setDeleteBuildId] = useState<string>();
  const [deleteArtifactId, setDeleteArtifactId] = useState<string>();
  const [title, setTitle] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [retentionDays, setRetentionDays] = useState('');
  const [artifactName, setArtifactName] = useState('');
  const [artifactKind, setArtifactKind] = useState<ArtifactKindName>('GENERIC');
  const [versionLabel, setVersionLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      return;
    }
    try {
      const [nextProject, nextBuilds, nextArtifacts, nextReleases] = await Promise.all([
        apiClient.getProject(projectId),
        apiClient.listBuilds(projectId),
        apiClient.listProjectArtifacts(projectId),
        apiClient.listReleases(projectId),
      ]);
      setProject(nextProject);
      setBuilds(nextBuilds);
      setArtifacts(nextArtifacts);
      setReleases(nextReleases);
      setSelectedBuildId((current) => current ?? nextBuilds[0]?.id);
      setProjectName(nextProject.name);
      setProjectDescription(nextProject.description ?? '');
      setRetentionDays(nextProject.retentionDays ? String(nextProject.retentionDays) : '');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load project');
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedBuild = builds.find((build) => build.id === selectedBuildId);
  const buildArtifacts = artifacts.filter((artifact) => artifact.buildId === selectedBuildId);

  const handleCreateBuild = async () => {
    const body = validate(
      parseForm(createBuildBodySchema, {
        title: title.trim() || undefined,
        gitRef: gitRef.trim() || undefined,
        commitSha: commitSha.trim() || undefined,
      }),
    );
    if (!body) {
      return;
    }
    try {
      const build = await apiClient.createBuild(projectId, body);
      setBuildOpen(false);
      setTitle('');
      setGitRef('');
      setCommitSha('');
      setSelectedBuildId(build.id);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleUpdateProject = async () => {
    const body = validate(
      parseForm(updateProjectBodySchema, {
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.updateProject(projectId, body);
      setEditOpen(false);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleStatus = async (status: BuildStatusName) => {
    if (!selectedBuild) {
      return;
    }
    try {
      await apiClient.updateBuild(projectId, selectedBuild.id, { status });
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleUpload = async () => {
    if (!selectedBuild || !file) {
      return;
    }
    setUploading(true);
    const body = validate(
      parseForm(initiateArtifactBodySchema, {
        name: artifactName.trim() || file.name,
        kind: artifactKind,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        versionLabel: versionLabel.trim() || undefined,
      }),
    );
    if (!body) {
      setUploading(false);
      return;
    }
    try {
      const initiated = await apiClient.initiateArtifactUpload(projectId, selectedBuild.id, body);
      await apiClient.uploadFileWithProgress(
        {
          upload: initiated.upload,
          uploadUrl: initiated.uploadUrl,
          method: initiated.method,
          expiresAt: initiated.expiresAt,
          headers: initiated.headers,
        },
        file,
      );
      await apiClient.completeArtifactUpload(initiated.version.id);
      setUploadOpen(false);
      setArtifactName('');
      setVersionLabel('');
      setFile(null);
      await refresh();
    } catch (caught) {
      catchError(caught);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (versionId: string) => {
    try {
      const download = await apiClient.createArtifactDownloadUrl(versionId);
      window.open(download.url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleRelease = async (versionId: string) => {
    try {
      await apiClient.releaseArtifactVersion(versionId);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  if (error && !project) {
    return <EmptyState title="Unable to load project" description={error} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link className="text-sm text-slate-500 hover:underline" to="/artifacts">
            ← Projects
          </Link>
          <h2 className="text-2xl font-semibold text-slate-900">{project?.name ?? 'Project'}</h2>
          <p className="text-sm text-slate-500">
            {project?.slug}
            {project?.retentionDays ? ` · retain ${project.retentionDays}d` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload ? (
            <>
              <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
                Edit project
              </Button>
              <Button type="button" onClick={() => setBuildOpen(true)}>
                New build
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Builds</CardTitle>
            <CardDescription>{builds.length} runs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {builds.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">No builds yet.</p>
            ) : (
              builds.map((build) => (
                <button
                  key={build.id}
                  type="button"
                  className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                    build.id === selectedBuildId ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => setSelectedBuildId(build.id)}
                >
                  <span className="block font-medium">#{build.number}</span>
                  <span className="block text-xs opacity-80">{build.status}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selectedBuild ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Build #{selectedBuild.number}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {selectedBuild.title ?? 'Untitled'}
                      {selectedBuild.gitRef ? ` · ${selectedBuild.gitRef}` : ''}
                      {selectedBuild.commitSha
                        ? ` · ${selectedBuild.commitSha.slice(0, 12)}`
                        : ''}
                    </p>
                  </div>
                  <Badge>{selectedBuild.status}</Badge>
                </div>
                {canUpload ? (
                  <div className="flex flex-wrap gap-2">
                    <Label htmlFor="build-status" className="sr-only">
                      Build status
                    </Label>
                    <select
                      id="build-status"
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                      value={selectedBuild.status}
                      onChange={(event) => void handleStatus(event.target.value as BuildStatusName)}
                    >
                      {BUILD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <Button type="button" onClick={() => setUploadOpen(true)}>
                      Upload artifact
                    </Button>
                    {canDelete ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setDeleteBuildId(selectedBuild.id)}
                      >
                        Delete build
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Artifacts</CardTitle>
                <CardDescription>{buildArtifacts.length} in this build</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {buildArtifacts.length === 0 ? (
                  <p className="text-sm text-slate-500">No artifacts uploaded for this build.</p>
                ) : (
                  buildArtifacts.map((artifact) => {
                    const version = artifact.currentVersion;
                    return (
                      <div
                        key={artifact.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-slate-900">{artifact.name}</p>
                          <p className="text-xs text-slate-500">
                            {artifact.kind}
                            {version
                              ? ` · v${version.version}${version.versionLabel ? ` (${version.versionLabel})` : ''} · ${version.status} · ${formatBytes(version.size)}`
                              : ''}
                            {version?.isRelease ? ' · release' : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {version?.status === 'AVAILABLE' ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDownload(version.id)}
                            >
                              Download
                            </Button>
                          ) : null}
                          {canUpload && version?.status === 'AVAILABLE' && !version.isRelease ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleRelease(version.id)}
                            >
                              Release
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDeleteArtifactId(artifact.id)}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState
            title="Select a build"
            description="Create a build, then upload artifacts into it."
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Releases</CardTitle>
          <CardDescription>Tagged artifact versions for this project</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {releases.length === 0 ? (
            <p className="text-sm text-slate-500">No releases yet.</p>
          ) : (
            releases.map((release) => (
              <div
                key={release.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {release.releaseTag ?? `v${release.version}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(release.size)}
                    {release.releasedAt ? ` · ${formatDate(release.releasedAt)}` : ''}
                  </p>
                </div>
                {release.status === 'AVAILABLE' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void handleDownload(release.id)}
                  >
                    Download
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={buildOpen}
        onOpenChange={setBuildOpen}
        title="Create build"
        footer={
          <DialogActions
            confirmLabel="Create"
            onCancel={() => setBuildOpen(false)}
            onConfirm={() => void handleCreateBuild()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="build-title">Title</Label>
            <Input id="build-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="build-ref">Git ref</Label>
            <Input id="build-ref" value={gitRef} onChange={(event) => setGitRef(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="build-sha">Commit SHA</Label>
            <Input
              id="build-sha"
              value={commitSha}
              aria-invalid={Boolean(fieldErrors.commitSha)}
              onChange={(event) => setCommitSha(event.target.value)}
            />
            <FieldError message={fieldErrors.commitSha} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit project"
        footer={
          <DialogActions
            confirmLabel="Save"
            confirmDisabled={!projectName.trim()}
            onCancel={() => setEditOpen(false)}
            onConfirm={() => void handleUpdateProject()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-project-name">Name</Label>
            <Input
              id="edit-project-name"
              value={projectName}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="edit-project-description">Description</Label>
            <Input
              id="edit-project-description"
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-project-retention">Retention days</Label>
            <Input
              id="edit-project-retention"
              inputMode="numeric"
              value={retentionDays}
              aria-invalid={Boolean(fieldErrors.retentionDays)}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
            <FieldError message={fieldErrors.retentionDays} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        title="Upload artifact"
        footer={
          <DialogActions
            confirmLabel={uploading ? 'Uploading…' : 'Upload'}
            confirmDisabled={!file || uploading}
            onCancel={() => setUploadOpen(false)}
            onConfirm={() => void handleUpload()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="artifact-name">Name</Label>
            <Input
              id="artifact-name"
              value={artifactName}
              placeholder={file?.name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setArtifactName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="artifact-kind">Kind</Label>
            <select
              id="artifact-kind"
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={artifactKind}
              onChange={(event) => setArtifactKind(event.target.value as ArtifactKindName)}
            >
              {ARTIFACT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="artifact-label">Version label</Label>
            <Input
              id="artifact-label"
              value={versionLabel}
              aria-invalid={Boolean(fieldErrors.versionLabel)}
              onChange={(event) => setVersionLabel(event.target.value)}
            />
            <FieldError message={fieldErrors.versionLabel} />
          </div>
          <div>
            <Label htmlFor="artifact-file">File</Label>
            <Input
              id="artifact-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteBuildId)}
        title="Delete build"
        description="Artifacts uploaded to this build will be deleted."
        onOpenChange={(open) => {
          if (!open) {
            setDeleteBuildId(undefined);
          }
        }}
        onConfirm={() => {
          if (!deleteBuildId) {
            return;
          }
          void apiClient
            .deleteBuild(projectId, deleteBuildId)
            .then(() => {
              setDeleteBuildId(undefined);
              setSelectedBuildId(undefined);
              return refresh();
            })
            .catch((caught: unknown) => {
              catchError(caught);
            });
        }}
      />

      <DeleteConfirmation
        open={Boolean(deleteArtifactId)}
        title="Delete artifact"
        description="All versions of this artifact will be deleted."
        onOpenChange={(open) => {
          if (!open) {
            setDeleteArtifactId(undefined);
          }
        }}
        onConfirm={() => {
          if (!deleteArtifactId) {
            return;
          }
          void apiClient
            .deleteArtifact(deleteArtifactId)
            .then(() => {
              setDeleteArtifactId(undefined);
              return refresh();
            })
            .catch((caught: unknown) => {
              catchError(caught);
            });
        }}
      />
    </div>
  );
}
