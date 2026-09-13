export interface DetectedDevice {
  label: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  platform: string;
  isMobile: boolean;
  userAgent: string;
  language: string;
  languages: string[];
  timeZone: string;
  screen: string;
  devicePixelRatio: number;
  cores?: number;
  memoryGb?: number;
  touchPoints: number;
  /** Populated asynchronously when network lookup succeeds. */
  ipAddress?: string;
  approxLocation?: string;
  isp?: string;
  networkLookedUpAt?: string;
}

export interface LinkedAuthenticatorDevice extends DetectedDevice {
  id: string;
  email?: string;
  linkedAt: string;
  lastSeenAt: string;
  /** How many times this browser session has been recorded active. */
  activeCount: number;
  /** User toggle: inactive devices stay listed but marked off. */
  enabled: boolean;
  status: 'current' | 'active';
}

const LINKED_DEVICES_KEY = 'vaultstack:2fa-linked-devices';

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

function sameDevice(a: DetectedDevice, b: DetectedDevice): boolean {
  return a.browser === b.browser && a.os === b.os && a.platform === b.platform && a.userAgent === b.userAgent;
}

function normalizeDevice(item: Partial<LinkedAuthenticatorDevice> & DetectedDevice): LinkedAuthenticatorDevice {
  return {
    ...item,
    id: item.id ?? `device-${Date.now()}`,
    email: item.email,
    linkedAt: item.linkedAt ?? new Date().toISOString(),
    lastSeenAt: item.lastSeenAt ?? item.linkedAt ?? new Date().toISOString(),
    activeCount: Math.max(1, Number(item.activeCount) || 1),
    enabled: item.enabled !== false,
    status: item.status === 'current' ? 'current' : 'active',
  };
}

/** Best-effort browser/OS fingerprint for 2FA enrollment feedback (client-side). */
export function detectDevice(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
): DetectedDevice {
  const ua = userAgent || 'unknown';
  const platform =
    typeof navigator !== 'undefined' && 'userAgentData' in navigator
      ? String(
          (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
            ?.platform ?? '',
        )
      : typeof navigator !== 'undefined'
        ? navigator.platform
        : '';

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
    osVersion = captureVersion(ua, /OS ([\d_]+) like Mac OS X/i).replace(/_/g, '.');
  }

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const label = browserVersion ? `${browser} ${browserVersion} on ${os}` : `${browser} on ${os}`;

  const language =
    typeof navigator !== 'undefined' ? navigator.language || 'unknown' : 'unknown';
  const languages =
    typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? [...navigator.languages]
      : [language];

  let timeZone = 'UTC';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    timeZone = 'UTC';
  }

  const screen =
    typeof window !== 'undefined'
      ? `${window.screen.width}×${window.screen.height}`
      : 'unknown';

  return {
    label,
    browser,
    browserVersion,
    os,
    osVersion,
    platform: platform || os,
    isMobile,
    userAgent: ua,
    language,
    languages,
    timeZone,
    screen,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    cores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
    memoryGb:
      typeof navigator !== 'undefined' && 'deviceMemory' in navigator
        ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory)
        : undefined,
    touchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
  };
}

/** Enrich device with public IP / approximate location (best-effort, non-blocking). */
export async function enrichDeviceNetwork(device: DetectedDevice): Promise<DetectedDevice> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const response = await fetch('https://ipapi.co/json/', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    window.clearTimeout(timer);
    if (!response.ok) {
      return device;
    }
    const payload = (await response.json()) as {
      ip?: string;
      city?: string;
      region?: string;
      country_name?: string;
      org?: string;
      error?: boolean;
    };
    if (payload.error || !payload.ip) {
      return device;
    }
    const locationParts = [payload.city, payload.region, payload.country_name].filter(Boolean);
    return {
      ...device,
      ipAddress: payload.ip,
      approxLocation: locationParts.join(', ') || undefined,
      isp: payload.org,
      networkLookedUpAt: new Date().toISOString(),
    };
  } catch {
    return device;
  }
}

export function loadLinkedAuthenticatorDevices(): LinkedAuthenticatorDevice[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(LINKED_DEVICES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as Array<Partial<LinkedAuthenticatorDevice> & DetectedDevice>;
    return Array.isArray(parsed) ? parsed.map((item) => normalizeDevice(item)) : [];
  } catch {
    return [];
  }
}

function persistDevices(devices: LinkedAuthenticatorDevice[]): LinkedAuthenticatorDevice[] {
  window.localStorage.setItem(LINKED_DEVICES_KEY, JSON.stringify(devices));
  return devices;
}

export function saveLinkedAuthenticatorDevice(
  detail: Omit<LinkedAuthenticatorDevice, 'id' | 'status' | 'lastSeenAt' | 'activeCount' | 'enabled'> & {
    id?: string;
    activeCount?: number;
    enabled?: boolean;
  },
): LinkedAuthenticatorDevice[] {
  const existing = loadLinkedAuthenticatorDevices().map((item) => ({
    ...item,
    status: 'active' as const,
  }));
  const match = existing.find((item) => sameDevice(item, detail));
  const next = normalizeDevice({
    ...detail,
    id: detail.id ?? match?.id ?? `device-${Date.now()}`,
    linkedAt: match?.linkedAt ?? detail.linkedAt,
    lastSeenAt: detail.linkedAt,
    activeCount: (match?.activeCount ?? 0) + 1,
    enabled: match?.enabled !== false,
    status: 'current',
  });
  const merged = [next, ...existing.filter((item) => item.id !== next.id)].slice(0, 8);
  return persistDevices(merged);
}

/** Ensure current browser appears in the session list and bump active count. */
export function touchCurrentBrowserSession(
  device: DetectedDevice,
  email?: string,
): LinkedAuthenticatorDevice[] {
  const existing = loadLinkedAuthenticatorDevices();
  const match = existing.find((item) => sameDevice(item, device));
  const now = new Date().toISOString();
  if (match) {
    const updated = existing.map((item) =>
      item.id === match.id
        ? {
            ...item,
            ...device,
            email: email ?? item.email,
            lastSeenAt: now,
            activeCount: item.activeCount + 1,
            status: 'current' as const,
          }
        : { ...item, status: 'active' as const },
    );
    return persistDevices(updated);
  }

  const bootstrap = normalizeDevice({
    ...device,
    email,
    linkedAt: now,
    lastSeenAt: now,
    activeCount: 1,
    enabled: true,
    status: 'current',
  });
  return persistDevices([bootstrap, ...existing.map((item) => ({ ...item, status: 'active' as const }))].slice(0, 8));
}

export function setAuthenticatorSessionEnabled(
  id: string,
  enabled: boolean,
): LinkedAuthenticatorDevice[] {
  const updated = loadLinkedAuthenticatorDevices().map((item) =>
    item.id === id ? { ...item, enabled } : item,
  );
  return persistDevices(updated);
}

export function patchAuthenticatorSessions(
  devices: LinkedAuthenticatorDevice[],
): LinkedAuthenticatorDevice[] {
  return persistDevices(devices);
}

export const TWO_FACTOR_DEVICE_LINKED_EVENT = 'vaultstack:2fa-device-linked';

export interface TwoFactorDeviceLinkedDetail {
  device: DetectedDevice;
  email?: string;
  linkedAt: string;
}

/** Notify the app (and any listeners) when authenticator enrollment succeeds. */
export function emitTwoFactorDeviceLinked(detail: TwoFactorDeviceLinkedDetail): void {
  if (typeof window === 'undefined') {
    return;
  }
  saveLinkedAuthenticatorDevice({
    ...detail.device,
    email: detail.email,
    linkedAt: detail.linkedAt,
  });
  window.dispatchEvent(new CustomEvent(TWO_FACTOR_DEVICE_LINKED_EVENT, { detail }));
}

export function onTwoFactorDeviceLinked(
  handler: (detail: TwoFactorDeviceLinkedDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const listener = (event: Event) => {
    handler((event as CustomEvent<TwoFactorDeviceLinkedDetail>).detail);
  };
  window.addEventListener(TWO_FACTOR_DEVICE_LINKED_EVENT, listener);
  return () => {
    window.removeEventListener(TWO_FACTOR_DEVICE_LINKED_EVENT, listener);
  };
}

export function formatDeviceWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
