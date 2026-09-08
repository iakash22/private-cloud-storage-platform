import type { StorageLifecycleActionName } from '@vaultstack/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface LifecyclePolicyRule {
  id: string;
  organizationId: string;
  bucketId: string | null;
  keyPrefix: string | null;
  days: number;
  lifecycleAction: StorageLifecycleActionName;
}

export type LifecycleDecision =
  | { type: 'expire-current'; policyId: string; organizationId: string; objectId: string }
  | {
      type: 'expire-noncurrent';
      policyId: string;
      organizationId: string;
      objectId: string;
      versionId: string;
    }
  | {
      type: 'abort-multipart';
      policyId: string;
      organizationId: string;
      multipartUploadId: string;
    }
  | {
      type: 'expire-temporary';
      policyId: string;
      organizationId: string;
      uploadId: string;
    };

export interface LifecycleCandidateObject {
  id: string;
  organizationId: string;
  bucketId: string;
  key: string;
  isDeleted: boolean;
  currentCreatedAt: Date;
}

export interface LifecycleCandidateVersion {
  objectId: string;
  organizationId: string;
  bucketId: string;
  key: string;
  versionId: string;
  isCurrent: boolean;
  isDeleteMarker: boolean;
  createdAt: Date;
}

export interface LifecycleCandidateUpload {
  id: string;
  organizationId: string;
  bucketId: string;
  key: string;
  createdAt: Date;
}

export interface LifecycleCandidateMultipart {
  id: string;
  organizationId: string;
  bucketId: string;
  key: string;
  lastActivityAt: Date;
}

export function isOlderThanDays(timestamp: Date, days: number, now: Date): boolean {
  return timestamp.getTime() + days * MS_PER_DAY <= now.getTime();
}

export function matchesLifecycleScope(
  candidate: { organizationId: string; bucketId: string; key: string },
  rule: LifecyclePolicyRule,
): boolean {
  if (candidate.organizationId !== rule.organizationId) {
    return false;
  }
  if (rule.bucketId && candidate.bucketId !== rule.bucketId) {
    return false;
  }
  if (rule.keyPrefix && !candidate.key.startsWith(rule.keyPrefix)) {
    return false;
  }
  return true;
}

/**
 * Pure policy evaluation. Callers load org-scoped candidates; this function
 * never talks to a provider and never inspects physical keys.
 */
export function evaluateLifecyclePolicies(input: {
  now: Date;
  rules: LifecyclePolicyRule[];
  objects: LifecycleCandidateObject[];
  versions: LifecycleCandidateVersion[];
  uploads: LifecycleCandidateUpload[];
  multiparts: LifecycleCandidateMultipart[];
}): LifecycleDecision[] {
  const decisions: LifecycleDecision[] = [];

  for (const rule of input.rules) {
    if (rule.lifecycleAction === 'EXPIRE_CURRENT') {
      for (const object of input.objects) {
        if (object.isDeleted) {
          continue;
        }
        if (!matchesLifecycleScope(object, rule)) {
          continue;
        }
        if (isOlderThanDays(object.currentCreatedAt, rule.days, input.now)) {
          decisions.push({
            type: 'expire-current',
            policyId: rule.id,
            organizationId: object.organizationId,
            objectId: object.id,
          });
        }
      }
    }

    if (rule.lifecycleAction === 'EXPIRE_NONCURRENT') {
      for (const version of input.versions) {
        if (version.isCurrent) {
          continue;
        }
        if (!matchesLifecycleScope(version, rule)) {
          continue;
        }
        if (isOlderThanDays(version.createdAt, rule.days, input.now)) {
          decisions.push({
            type: 'expire-noncurrent',
            policyId: rule.id,
            organizationId: version.organizationId,
            objectId: version.objectId,
            versionId: version.versionId,
          });
        }
      }
    }

    if (rule.lifecycleAction === 'EXPIRE_TEMPORARY') {
      for (const upload of input.uploads) {
        if (!matchesLifecycleScope(upload, rule)) {
          continue;
        }
        if (isOlderThanDays(upload.createdAt, rule.days, input.now)) {
          decisions.push({
            type: 'expire-temporary',
            policyId: rule.id,
            organizationId: upload.organizationId,
            uploadId: upload.id,
          });
        }
      }
    }

    if (rule.lifecycleAction === 'ABORT_INCOMPLETE_MULTIPART') {
      for (const multipart of input.multiparts) {
        if (!matchesLifecycleScope(multipart, rule)) {
          continue;
        }
        if (isOlderThanDays(multipart.lastActivityAt, rule.days, input.now)) {
          decisions.push({
            type: 'abort-multipart',
            policyId: rule.id,
            organizationId: multipart.organizationId,
            multipartUploadId: multipart.id,
          });
        }
      }
    }
  }

  return decisions;
}
