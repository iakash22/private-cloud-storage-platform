import type { NextFunction, Request, Response } from 'express';
import type { EnvConfig } from '@vaultstack/config';
import type { PrismaClient } from '@vaultstack/database';
import type { Redis } from 'ioredis';
import type { StorageMetrics } from '../modules/storage/services/storage.metrics.js';
import { collectRuntimeMetrics } from './metrics.collector.js';

export type MetricLabels = Readonly<Record<string, string | number>>;
export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricsRecorder {
  increment(name: string, labels?: MetricLabels, value?: number): void;
  set(name: string, value: number, labels?: MetricLabels): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
}

interface MetricSeries {
  labels: Record<string, string>;
  value: number;
  count: number;
  sum: number;
  buckets: number[];
}

interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labelNames: string[];
  buckets: number[];
  series: Map<string, MetricSeries>;
}

const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

export class MetricsRegistry implements MetricsRecorder {
  private readonly definitions = new Map<string, MetricDefinition>();

  register(
    name: string,
    help: string,
    type: MetricType,
    labelNames: string[] = [],
    buckets: number[] = HISTOGRAM_BUCKETS,
  ): void {
    if (this.definitions.has(name)) {
      return;
    }

    this.definitions.set(name, {
      name,
      help,
      type,
      labelNames,
      buckets: type === 'histogram' ? buckets : [],
      series: new Map(),
    });
  }

  increment(name: string, labels: MetricLabels = {}, value = 1): void {
    const definition = this.requireDefinition(name);
    const series = this.getSeries(definition, labels);
    series.value += value;
  }

  set(name: string, value: number, labels: MetricLabels = {}): void {
    const definition = this.requireDefinition(name);
    const series = this.getSeries(definition, labels);
    series.value = value;
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    const definition = this.requireDefinition(name);
    const series = this.getSeries(definition, labels);
    series.count += 1;
    series.sum += value;
    for (const [index, bucket] of definition.buckets.entries()) {
      if (value <= bucket) {
        series.buckets[index] = (series.buckets[index] ?? 0) + 1;
      }
    }
  }

  render(): string {
    const output: string[] = [];

    for (const definition of this.definitions.values()) {
      output.push(`# HELP ${definition.name} ${definition.help}`);
      output.push(`# TYPE ${definition.name} ${definition.type}`);

      for (const series of definition.series.values()) {
        if (definition.type === 'histogram') {
          for (const [index, bucket] of definition.buckets.entries()) {
            output.push(
              `${definition.name}_bucket${renderLabels(series.labels, {
                le: String(bucket),
              })} ${series.buckets[index]}`,
            );
          }
          output.push(
            `${definition.name}_bucket${renderLabels(series.labels, { le: '+Inf' })} ${series.count}`,
          );
          output.push(
            `${definition.name}_sum${renderLabels(series.labels)} ${formatValue(series.sum)}`,
          );
          output.push(`${definition.name}_count${renderLabels(series.labels)} ${series.count}`);
        } else {
          output.push(
            `${definition.name}${renderLabels(series.labels)} ${formatValue(series.value)}`,
          );
        }
      }
    }

    return `${output.join('\n')}\n`;
  }

  private requireDefinition(name: string): MetricDefinition {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Metric is not registered: ${name}`);
    }
    return definition;
  }

  private getSeries(definition: MetricDefinition, labels: MetricLabels): MetricSeries {
    const normalized: Record<string, string> = {};
    for (const labelName of definition.labelNames) {
      normalized[labelName] = String(labels[labelName] ?? '');
    }

    const key = definition.labelNames.map((name) => normalized[name]).join('\u0000');
    const existing = definition.series.get(key);
    if (existing) {
      return existing;
    }

    const series: MetricSeries = {
      labels: normalized,
      value: 0,
      count: 0,
      sum: 0,
      buckets: definition.buckets.map(() => 0),
    };
    definition.series.set(key, series);
    return series;
  }
}

export function createMetricsRegistry(): MetricsRegistry {
  const registry = new MetricsRegistry();

  registry.register(
    'vaultstack_http_requests_total',
    'Total HTTP requests handled by the API.',
    'counter',
    ['method', 'route', 'status'],
  );
  registry.register(
    'vaultstack_http_request_duration_seconds',
    'HTTP request duration in seconds.',
    'histogram',
    ['method', 'route'],
  );
  registry.register(
    'vaultstack_http_errors_total',
    'Total HTTP responses with a server or client error status.',
    'counter',
    ['method', 'route', 'status'],
  );
  registry.register('vaultstack_s3_requests_total', 'Total S3 gateway requests.', 'counter', [
    'method',
    'status',
  ]);
  registry.register('vaultstack_storage_uploads_total', 'Completed object uploads.', 'counter');
  registry.register('vaultstack_storage_downloads_total', 'Completed object downloads.', 'counter');
  registry.register(
    'vaultstack_storage_bytes_uploaded_total',
    'Bytes uploaded to storage.',
    'counter',
  );
  registry.register(
    'vaultstack_storage_bytes_downloaded_total',
    'Bytes downloaded from storage.',
    'counter',
  );
  registry.register('vaultstack_storage_failed_uploads_total', 'Failed object uploads.', 'counter');
  registry.register('vaultstack_storage_active_uploads', 'Active object uploads.', 'gauge');
  registry.register(
    'vaultstack_storage_multipart_uploads_total',
    'Completed multipart uploads.',
    'counter',
  );
  registry.register(
    'vaultstack_storage_multipart_parts_total',
    'Uploaded multipart parts.',
    'counter',
  );
  registry.register(
    'vaultstack_storage_multipart_cleanups_total',
    'Multipart cleanup runs.',
    'counter',
  );
  registry.register(
    'vaultstack_storage_provider_errors_total',
    'Storage provider errors.',
    'counter',
  );
  registry.register('vaultstack_database_up', 'Whether PostgreSQL is reachable.', 'gauge');
  registry.register(
    'vaultstack_database_latency_seconds',
    'PostgreSQL health-check latency in seconds.',
    'gauge',
  );
  registry.register('vaultstack_redis_up', 'Whether Redis is reachable.', 'gauge');
  registry.register(
    'vaultstack_redis_latency_seconds',
    'Redis health-check latency in seconds.',
    'gauge',
  );
  registry.register('vaultstack_objects_total', 'Visible object count.', 'gauge');
  registry.register('vaultstack_buckets_total', 'Bucket count.', 'gauge');
  registry.register('vaultstack_active_uploads', 'Active database upload sessions.', 'gauge');
  registry.register('vaultstack_multipart_jobs', 'Active multipart database jobs.', 'gauge');
  registry.register('vaultstack_backup_jobs', 'Backup jobs by status.', 'gauge', ['status']);
  registry.register('vaultstack_worker_queue_jobs', 'BullMQ jobs by queue and state.', 'gauge', [
    'queue',
    'state',
  ]);
  registry.register(
    'vaultstack_storage_disk_bytes',
    'Storage filesystem capacity in bytes.',
    'gauge',
    ['kind'],
  );
  registry.register(
    'vaultstack_storage_disk_usage_ratio',
    'Storage filesystem used capacity ratio.',
    'gauge',
  );
  registry.register(
    'vaultstack_storage_corruption_indicators_total',
    'Detected storage integrity or checksum indicators.',
    'counter',
  );

  return registry;
}

export function createHttpMetricsMiddleware(registry: MetricsRegistry) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const route = resolveRoute(req);
      const status = String(res.statusCode);
      const labels = { method: req.method, route, status };

      registry.increment('vaultstack_http_requests_total', labels);
      registry.observe('vaultstack_http_request_duration_seconds', durationSeconds, {
        method: req.method,
        route,
      });

      if (res.statusCode >= 400) {
        registry.increment('vaultstack_http_errors_total', labels);
      }
      if (req.path.startsWith('/api/v1/s3')) {
        registry.increment('vaultstack_s3_requests_total', {
          method: req.method,
          status,
        });
      }
    });

    next();
  };
}

export function createMetricsHandler(input: {
  registry: MetricsRegistry;
  config: EnvConfig;
  prisma: PrismaClient;
  redis: Redis;
  storageMetrics: StorageMetrics;
}) {
  return async (req: Request, res: Response): Promise<void> => {
    const token = input.config.METRICS_TOKEN;
    if (!token || req.header('authorization') !== `Bearer ${token}`) {
      res.status(404).end();
      return;
    }

    await collectRuntimeMetrics(input);
    res.type('text/plain; version=0.0.4').send(input.registry.render());
  };
}

function resolveRoute(req: Request): string {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath === 'string') {
    return `${req.baseUrl}${routePath}`;
  }
  if (req.path.startsWith('/api/v1/s3')) {
    return '/api/v1/s3';
  }
  if (req.path === '/health' || req.path === '/ready') {
    return req.path;
  }
  return 'unmatched';
}

function renderLabels(labels: Record<string, string>, extra: Record<string, string> = {}): string {
  const merged = { ...labels, ...extra };
  const entries = Object.entries(merged);
  if (entries.length === 0) {
    return '';
  }
  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}
