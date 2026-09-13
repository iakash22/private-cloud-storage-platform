/**
 * Best-effort IP geolocation for session security UI.
 * Uses city/region/country + approximate coordinates from an IP database —
 * not GPS. Remote sessions cannot report true GPS location.
 */

export interface IpGeoLookup {
  ipAddress: string;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  /** Human-readable place label, e.g. "Bengaluru, Karnataka, IN". */
  locationLabel: string | null;
  /** Accuracy disclaimer for clients. */
  accuracy: 'ip-approximate';
}

interface CacheEntry {
  value: IpGeoLookup | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 2500;

const cache = new Map<string, CacheEntry>();

function isPrivateOrLocal(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  if (!value || value === '::1' || value === '127.0.0.1' || value === '0.0.0.0') {
    return true;
  }
  if (value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('127.')) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) {
    return true;
  }
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) {
    return true;
  }
  return false;
}

function buildLabel(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  return cleaned.length > 0 ? cleaned.join(', ') : null;
}

function localLookup(ipAddress: string): IpGeoLookup {
  return {
    ipAddress,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    isp: null,
    locationLabel: 'Local / private network',
    accuracy: 'ip-approximate',
  };
}

async function fetchIpApi(ipAddress: string): Promise<IpGeoLookup | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://ipapi.co/${encodeURIComponent(ipAddress)}/json/`,
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      },
    );
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      error?: boolean;
      reason?: string;
      ip?: string;
      city?: string | null;
      region?: string | null;
      country_name?: string | null;
      country_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      org?: string | null;
    };
    if (payload.error) {
      return null;
    }
    const city = payload.city?.trim() || null;
    const region = payload.region?.trim() || null;
    const country = payload.country_name?.trim() || null;
    const countryCode = payload.country_code?.trim() || null;
    return {
      ipAddress: payload.ip?.trim() || ipAddress,
      city,
      region,
      country,
      countryCode,
      latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
      longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
      isp: payload.org?.trim() || null,
      locationLabel: buildLabel([city, region, countryCode ?? country]),
      accuracy: 'ip-approximate',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupIpGeo(ipAddress: string | null | undefined): Promise<IpGeoLookup | null> {
  const ip = ipAddress?.trim();
  if (!ip) {
    return null;
  }

  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = isPrivateOrLocal(ip) ? localLookup(ip) : await fetchIpApi(ip);
  cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function lookupIpGeoMany(
  ips: Array<string | null | undefined>,
): Promise<Map<string, IpGeoLookup | null>> {
  const unique = [...new Set(ips.map((ip) => ip?.trim()).filter((ip): ip is string => Boolean(ip)))];
  const entries = await Promise.all(
    unique.map(async (ip) => [ip, await lookupIpGeo(ip)] as const),
  );
  return new Map(entries);
}
