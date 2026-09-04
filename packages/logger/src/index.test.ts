import { describe, expect, it } from 'vitest';
import { createLogger } from './index.js';

describe('@vaultstack/logger', () => {
  it('creates a logger with the given name', () => {
    const logger = createLogger({ name: 'test-service', level: 'error' });
    expect(logger.bindings().name).toBe('test-service');
  });
});
