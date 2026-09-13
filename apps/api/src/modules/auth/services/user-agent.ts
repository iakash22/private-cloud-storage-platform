export interface ParsedUserAgent {
  label: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  isMobile: boolean;
}

function pickMatch(value: string, patterns: Array<[RegExp, string]>): string {
  for (const [pattern, label] of patterns) {
    if (pattern.test(value)) {
      return label;
    }
  }
  return 'Unknown';
}

function captureVersion(ua: string, pattern: RegExp): string {
  const match = ua.match(pattern);
  return match?.[1] ?? '';
}

/** Lightweight UA parsing for session labels — no extra dependency. */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = userAgent?.trim() || 'unknown';

  const browser = pickMatch(ua, [
    [/Edg\//i, 'Microsoft Edge'],
    [/OPR\//i, 'Opera'],
    [/Chrome\//i, 'Chrome'],
    [/Safari\//i, 'Safari'],
    [/Firefox\//i, 'Firefox'],
  ]);

  const browserVersion = captureVersion(
    ua,
    browser === 'Microsoft Edge'
      ? /Edg\/([\d.]+)/i
      : browser === 'Opera'
        ? /OPR\/([\d.]+)/i
        : browser === 'Firefox'
          ? /Firefox\/([\d.]+)/i
          : browser === 'Safari'
            ? /Version\/([\d.]+)/i
            : /Chrome\/([\d.]+)/i,
  );

  const os = pickMatch(ua, [
    [/Android/i, 'Android'],
    [/iPhone|iPad|iPod/i, 'iOS'],
    [/Windows NT/i, 'Windows'],
    [/Mac OS X/i, 'macOS'],
    [/Linux/i, 'Linux'],
  ]);

  let osVersion = '';
  if (os === 'Windows') {
    const win = captureVersion(ua, /Windows NT ([\d.]+)/i);
    osVersion =
      win === '10.0'
        ? '10 / 11'
        : win === '6.3'
          ? '8.1'
          : win === '6.2'
            ? '8'
            : win === '6.1'
              ? '7'
              : win;
  } else if (os === 'macOS') {
    osVersion = captureVersion(ua, /Mac OS X ([\d_]+)/i).replace(/_/g, '.');
  } else if (os === 'Android') {
    osVersion = captureVersion(ua, /Android ([\d.]+)/i);
  } else if (os === 'iOS') {
    osVersion = captureVersion(ua, /OS ([\d_]+) like/i).replace(/_/g, '.');
  }

  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const browserLabel = browserVersion ? `${browser} ${browserVersion}` : browser;
  const osLabel = osVersion ? `${os} ${osVersion}` : os;

  return {
    label: `${browser} on ${os}`,
    browser: browserLabel,
    browserVersion,
    os: osLabel,
    osVersion,
    isMobile,
  };
}
