import { describe, expect, it } from 'vitest';
import { AUTH_NOT_IMPLEMENTED, createEmptyAuthContext } from './index.js';

describe('@vaultstack/auth', () => {
  it('returns an empty auth context placeholder', () => {
    const context = createEmptyAuthContext();
    expect(context.userId).toBeNull();
    expect(context.organizationId).toBeNull();
  });

  it('documents that auth is not implemented yet', () => {
    expect(AUTH_NOT_IMPLEMENTED).toContain('Phase 0');
  });
});
