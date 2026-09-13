import { describe, expect, it } from 'vitest';
import { parseUserAgent } from './user-agent.js';

describe('parseUserAgent', () => {
  it('labels Chrome on Windows', () => {
    const parsed = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(parsed.label).toBe('Chrome on Windows');
    expect(parsed.isMobile).toBe(false);
    expect(parsed.browser).toContain('Chrome');
  });

  it('detects mobile Safari', () => {
    const parsed = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    );
    expect(parsed.isMobile).toBe(true);
    expect(parsed.os).toContain('iOS');
  });
});
