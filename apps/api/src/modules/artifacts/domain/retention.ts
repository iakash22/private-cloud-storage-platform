const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ArtifactRetentionProject {
  id: string;
  organizationId: string;
  retentionDays: number | null;
}

export interface ArtifactRetentionVersion {
  id: string;
  organizationId: string;
  projectId: string;
  status: 'PENDING' | 'AVAILABLE' | 'FAILED';
  isRelease: boolean;
  createdAt: Date;
}

export interface ArtifactRetentionDecision {
  type: 'expire-version';
  organizationId: string;
  versionId: string;
  reason: 'age' | 'stale-pending';
}

export function isOlderThanDays(timestamp: Date, days: number, now: Date): boolean {
  return timestamp.getTime() + days * MS_PER_DAY <= now.getTime();
}

/**
 * Pure retention evaluation. Releases are never expired by age. Stale PENDING
 * (and FAILED) versions are expired independently of project retentionDays.
 */
export function evaluateArtifactRetention(input: {
  now: Date;
  pendingMaxAgeMs: number;
  projects: ArtifactRetentionProject[];
  versions: ArtifactRetentionVersion[];
}): ArtifactRetentionDecision[] {
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const decisions: ArtifactRetentionDecision[] = [];

  for (const version of input.versions) {
    if (version.status === 'PENDING' || version.status === 'FAILED') {
      if (input.now.getTime() - version.createdAt.getTime() >= input.pendingMaxAgeMs) {
        decisions.push({
          type: 'expire-version',
          organizationId: version.organizationId,
          versionId: version.id,
          reason: 'stale-pending',
        });
      }
      continue;
    }

    if (version.isRelease) {
      continue;
    }

    const project = projectsById.get(version.projectId);
    if (project?.retentionDays == null) {
      continue;
    }

    if (isOlderThanDays(version.createdAt, project.retentionDays, input.now)) {
      decisions.push({
        type: 'expire-version',
        organizationId: version.organizationId,
        versionId: version.id,
        reason: 'age',
      });
    }
  }

  return decisions;
}
