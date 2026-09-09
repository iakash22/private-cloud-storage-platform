import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicProject } from '@vaultstack/types';
import {
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
  Input,
  Label,
} from '@vaultstack/ui';
import { createProjectBodySchema, parseForm } from '@vaultstack/validation';
import { useAuth } from '../../context/auth-context.js';
import { apiClient } from '../../lib/api.js';
import {
  canDeleteArtifacts,
  canUploadArtifacts,
} from '../../lib/dashboard-permissions.js';
import { useFormSubmit } from '../../lib/form-errors.js';

export function ArtifactsProjectsPage() {
  const { permissions } = useAuth();
  const canUpload = canUploadArtifacts(permissions);
  const canDelete = canDeleteArtifacts(permissions);
  const { fieldErrors, validate, catchError } = useFormSubmit();
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string>();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [retentionDays, setRetentionDays] = useState('');

  const refresh = useCallback(async () => {
    try {
      setProjects(await apiClient.listProjects());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load projects');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const body = validate(
      parseForm(createProjectBodySchema, {
        name,
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        retentionDays: retentionDays.trim() ? Number(retentionDays) : null,
      }),
    );
    if (!body) {
      return;
    }
    try {
      await apiClient.createProject(body);
      setCreateOpen(false);
      setName('');
      setSlug('');
      setDescription('');
      setRetentionDays('');
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }
    try {
      await apiClient.deleteProject(deleteId);
      setDeleteId(undefined);
      await refresh();
    } catch (caught) {
      catchError(caught);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Artifact projects</h2>
          <p className="text-sm text-slate-500">
            Group CI/CD builds, uploaded artifacts, and releases.
          </p>
        </div>
        {canUpload ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            Create project
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {projects.length === 0 ? (
        <EmptyState
          title="No artifact projects"
          description="Create a project to store build outputs and release packages."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projects</CardTitle>
            <CardDescription>{projects.length} configured</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3"
              >
                <div>
                  <Link
                    className="font-medium text-slate-900 underline-offset-2 hover:underline"
                    to={`/artifacts/${project.id}`}
                  >
                    {project.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {project.slug}
                    {project.retentionDays ? ` · retain ${project.retentionDays}d` : ''}
                    {project.description ? ` · ${project.description}` : ''}
                  </p>
                </div>
                {canDelete ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteId(project.id)}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create project"
        description="Projects hold builds and the artifacts uploaded for each run."
        footer={
          <DialogActions
            confirmLabel="Create"
            confirmDisabled={false}
            onCancel={() => setCreateOpen(false)}
            onConfirm={() => void handleCreate()}
          />
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setName(event.target.value)}
            />
            <FieldError message={fieldErrors.name} />
          </div>
          <div>
            <Label htmlFor="project-slug">Slug (optional)</Label>
            <Input
              id="project-slug"
              value={slug}
              aria-invalid={Boolean(fieldErrors.slug)}
              onChange={(event) => setSlug(event.target.value)}
            />
            <FieldError message={fieldErrors.slug} />
          </div>
          <div>
            <Label htmlFor="project-description">Description</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="project-retention">Retention days</Label>
            <Input
              id="project-retention"
              inputMode="numeric"
              value={retentionDays}
              onChange={(event) => setRetentionDays(event.target.value)}
            />
          </div>
        </div>
      </Dialog>

      <DeleteConfirmation
        open={Boolean(deleteId)}
        title="Delete project"
        description="Builds, artifacts, and releases in this project will be deleted."
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(undefined);
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
