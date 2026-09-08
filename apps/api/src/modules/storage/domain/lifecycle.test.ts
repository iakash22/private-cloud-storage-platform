import { describe, expect, it } from 'vitest';
import { evaluateLifecyclePolicies, isOlderThanDays } from './lifecycle.js';

const now = new Date('2026-09-08T00:00:00.000Z');

const rule = {
  id: 'policy-1',
  organizationId: 'org-1',
  bucketId: 'bucket-1',
  keyPrefix: null as string | null,
  days: 7,
  lifecycleAction: 'EXPIRE_CURRENT' as const,
};

describe('lifecycle policy evaluation', () => {
  it('expires current objects older than the configured age', () => {
    const decisions = evaluateLifecyclePolicies({
      now,
      rules: [rule],
      objects: [
        {
          id: 'obj-old',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'a.txt',
          isDeleted: false,
          currentCreatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 'obj-new',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'b.txt',
          isDeleted: false,
          currentCreatedAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      ],
      versions: [],
      uploads: [],
      multiparts: [],
    });

    expect(decisions).toEqual([
      {
        type: 'expire-current',
        policyId: 'policy-1',
        organizationId: 'org-1',
        objectId: 'obj-old',
      },
    ]);
  });

  it('ignores delete-marked current objects and other organizations', () => {
    const decisions = evaluateLifecyclePolicies({
      now,
      rules: [rule],
      objects: [
        {
          id: 'obj-deleted',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'gone.txt',
          isDeleted: true,
          currentCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'obj-other',
          organizationId: 'org-2',
          bucketId: 'bucket-1',
          key: 'a.txt',
          isDeleted: false,
          currentCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      versions: [],
      uploads: [],
      multiparts: [],
    });

    expect(decisions).toEqual([]);
  });

  it('expires noncurrent versions, incomplete uploads, and stale multipart sessions', () => {
    const decisions = evaluateLifecyclePolicies({
      now,
      rules: [
        { ...rule, id: 'p-noncurrent', lifecycleAction: 'EXPIRE_NONCURRENT' },
        { ...rule, id: 'p-tmp', lifecycleAction: 'EXPIRE_TEMPORARY', keyPrefix: 'tmp/' },
        { ...rule, id: 'p-mp', lifecycleAction: 'ABORT_INCOMPLETE_MULTIPART' },
      ],
      objects: [],
      versions: [
        {
          objectId: 'obj-1',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'a.txt',
          versionId: 'v1',
          isCurrent: false,
          isDeleteMarker: false,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          objectId: 'obj-1',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'a.txt',
          versionId: 'v2',
          isCurrent: true,
          isDeleteMarker: false,
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      uploads: [
        {
          id: 'upload-1',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'tmp/partial.bin',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 'upload-2',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'keep.bin',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      multiparts: [
        {
          id: 'mp-1',
          organizationId: 'org-1',
          bucketId: 'bucket-1',
          key: 'big.bin',
          lastActivityAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    });

    expect(decisions.map((decision) => decision.type).sort()).toEqual([
      'abort-multipart',
      'expire-noncurrent',
      'expire-temporary',
    ]);
  });

  it('treats an exact day boundary as expired', () => {
    expect(isOlderThanDays(new Date('2026-09-01T00:00:00.000Z'), 7, now)).toBe(true);
    expect(isOlderThanDays(new Date('2026-09-01T00:00:01.000Z'), 7, now)).toBe(false);
  });
});
