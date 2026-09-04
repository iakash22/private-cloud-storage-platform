import { describe, expect, it } from 'vitest';
import { ARTIFACT_QUEUE_NAME } from './index.js';

describe('@vaultstack/artifact-worker', () => {
  it('defines the artifact queue name', () => {
    expect(ARTIFACT_QUEUE_NAME).toBe('artifact-jobs');
  });
});
