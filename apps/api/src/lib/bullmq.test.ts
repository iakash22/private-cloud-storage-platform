import { describe, expect, it } from 'vitest';
import { Queue, Worker } from './bullmq.js';

describe('bullmq CJS interop', () => {
  it('loads Queue and Worker constructors', () => {
    expect(typeof Queue).toBe('function');
    expect(typeof Worker).toBe('function');
  });
});
