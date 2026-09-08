/** Logical bucket used for CI artifacts. Bytes still go through StorageService. */
export const ARTIFACTS_BUCKET_NAME = 'vs-artifacts';

/** Abandoned PENDING uploads older than this are eligible for retention. */
export const ARTIFACT_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
