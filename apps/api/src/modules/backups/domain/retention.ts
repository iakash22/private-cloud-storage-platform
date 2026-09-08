export interface RetentionPolicy {
  retentionDays: number | null;
  retentionCount: number | null;
}

export interface RetentionSnapshot {
  id: string;
  createdAt: Date;
  expiresAt: Date | null;
}

/**
 * Select snapshots that should be deleted: expired by `expiresAt`, older than
 * `retentionDays`, or beyond `retentionCount` (keeping the newest).
 */
export function selectSnapshotsForRetention(
  snapshots: RetentionSnapshot[],
  now: Date,
  policy: RetentionPolicy,
): string[] {
  const expired = new Set<string>();

  for (const snapshot of snapshots) {
    if (snapshot.expiresAt && snapshot.expiresAt.getTime() <= now.getTime()) {
      expired.add(snapshot.id);
    }
  }

  if (policy.retentionDays !== null) {
    const cutoff = now.getTime() - policy.retentionDays * 24 * 60 * 60 * 1000;
    for (const snapshot of snapshots) {
      if (snapshot.createdAt.getTime() < cutoff) {
        expired.add(snapshot.id);
      }
    }
  }

  if (policy.retentionCount !== null) {
    const keep = [...snapshots]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, policy.retentionCount)
      .map((snapshot) => snapshot.id);
    const keepSet = new Set(keep);
    for (const snapshot of snapshots) {
      if (!keepSet.has(snapshot.id)) {
        expired.add(snapshot.id);
      }
    }
  }

  return [...expired];
}
