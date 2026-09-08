import { describe, expect, it, vi } from 'vitest';
import { runArtifactRetention } from './artifact-retention.worker.js';

describe('artifact retention worker', () => {
  it('delegates expiration to the artifacts service', async () => {
    const artifacts = {
      applyRetention: vi.fn(async () => ({ expired: 4 })),
    };

    await expect(runArtifactRetention(artifacts as never)).resolves.toEqual({ expired: 4 });
    expect(artifacts.applyRetention).toHaveBeenCalledTimes(1);
  });
});
