import { describe, expect, it, vi } from 'vitest';
import { runMultipartCleanup } from './multipart-cleanup.worker.js';

describe('multipart cleanup worker', () => {
  it('delegates expired session reclamation to the upload service', async () => {
    const uploads = {
      cleanupExpired: vi.fn(async () => ({ uploads: 2, multipart: 3 })),
    };

    await expect(runMultipartCleanup(uploads as never)).resolves.toEqual({
      uploads: 2,
      multipart: 3,
    });
    expect(uploads.cleanupExpired).toHaveBeenCalledTimes(1);
  });
});
