import { describe, expect, it } from 'vitest';
import { evaluateArtifactRetention } from './retention.js';

const now = new Date('2026-09-08T12:00:00.000Z');
const pendingMaxAgeMs = 24 * 60 * 60 * 1000;

describe('evaluateArtifactRetention', () => {
  it('expires non-release available versions older than project retention', () => {
    const decisions = evaluateArtifactRetention({
      now,
      pendingMaxAgeMs,
      projects: [{ id: 'p1', organizationId: 'org', retentionDays: 7 }],
      versions: [
        {
          id: 'keep-recent',
          organizationId: 'org',
          projectId: 'p1',
          status: 'AVAILABLE',
          isRelease: false,
          createdAt: new Date('2026-09-05T12:00:00.000Z'),
        },
        {
          id: 'expire-old',
          organizationId: 'org',
          projectId: 'p1',
          status: 'AVAILABLE',
          isRelease: false,
          createdAt: new Date('2026-08-01T12:00:00.000Z'),
        },
        {
          id: 'keep-release',
          organizationId: 'org',
          projectId: 'p1',
          status: 'AVAILABLE',
          isRelease: true,
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
        },
      ],
    });

    expect(decisions).toEqual([
      {
        type: 'expire-version',
        organizationId: 'org',
        versionId: 'expire-old',
        reason: 'age',
      },
    ]);
  });

  it('expires stale pending uploads even when the project has no retention', () => {
    const decisions = evaluateArtifactRetention({
      now,
      pendingMaxAgeMs,
      projects: [{ id: 'p1', organizationId: 'org', retentionDays: null }],
      versions: [
        {
          id: 'stale',
          organizationId: 'org',
          projectId: 'p1',
          status: 'PENDING',
          isRelease: false,
          createdAt: new Date('2026-09-06T11:00:00.000Z'),
        },
        {
          id: 'fresh',
          organizationId: 'org',
          projectId: 'p1',
          status: 'PENDING',
          isRelease: false,
          createdAt: new Date('2026-09-08T10:00:00.000Z'),
        },
      ],
    });

    expect(decisions).toEqual([
      {
        type: 'expire-version',
        organizationId: 'org',
        versionId: 'stale',
        reason: 'stale-pending',
      },
    ]);
  });
});
