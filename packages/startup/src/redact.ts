const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi;

export function sanitizePublicMessage(message: string): string {
  return message.replace(URL_PATTERN, '[redacted-url]').replace(/\s+/g, ' ').trim();
}

export function parsePostgresTarget(databaseUrl: string): {
  host: string;
  port: number;
  database: string;
} {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, '');

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: database.length > 0 ? database : 'postgres',
  };
}

export function parseRedisTarget(redisUrl: string): { host: string; port: number } {
  const parsed = new URL(redisUrl);

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
}

export function formatEndpoint(host: string, port: number): string {
  return `${host}:${String(port)}`;
}

export function shortStatusDetail(message: string, maxLength = 18): string {
  const sanitized = sanitizePublicMessage(message);
  const lower = sanitized.toLowerCase();

  if (lower.includes('reach database') || lower.includes('unreachable')) {
    return 'unreachable';
  }
  if (lower.includes('connection is closed') || lower.includes('econnrefused')) {
    return 'closed';
  }
  if (lower.includes('connection refused')) {
    return 'refused';
  }
  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  return `${sanitized.slice(0, maxLength - 1)}…`;
}
