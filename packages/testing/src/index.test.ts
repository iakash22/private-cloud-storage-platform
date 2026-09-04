import { describe, expect, it } from 'vitest';
import { createTestId, waitForCondition } from './index.js';

describe('@vaultstack/testing', () => {
  it('creates unique test ids', () => {
    const first = createTestId('item');
    const second = createTestId('item');
    expect(first).not.toBe(second);
    expect(first.startsWith('item-')).toBe(true);
  });

  it('waits for a condition to become true', async () => {
    let ready = false;
    setTimeout(() => {
      ready = true;
    }, 100);

    await waitForCondition(() => ready, { timeoutMs: 1000, intervalMs: 50 });
    expect(ready).toBe(true);
  });
});
