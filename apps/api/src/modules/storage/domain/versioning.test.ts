import { BucketVersioningStatus } from '@vaultstack/database';
import { describe, expect, it } from 'vitest';
import {
  discardsAllNonCurrentOnPut,
  replacesCurrentVersionOnPut,
  retainsVersionHistory,
  usesDeleteMarkers,
} from './versioning.js';

describe('bucket versioning mode', () => {
  it('retains history and uses delete markers only when enabled', () => {
    expect(retainsVersionHistory(BucketVersioningStatus.ENABLED)).toBe(true);
    expect(usesDeleteMarkers(BucketVersioningStatus.ENABLED)).toBe(true);
    expect(discardsAllNonCurrentOnPut(BucketVersioningStatus.UNVERSIONED)).toBe(true);
    expect(replacesCurrentVersionOnPut(BucketVersioningStatus.SUSPENDED)).toBe(true);
    expect(usesDeleteMarkers(BucketVersioningStatus.SUSPENDED)).toBe(false);
  });
});
