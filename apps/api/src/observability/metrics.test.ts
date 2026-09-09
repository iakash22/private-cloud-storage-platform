import { describe, expect, it } from 'vitest';
import { createMetricsRegistry } from './metrics.js';

describe('metrics registry', () => {
  it('renders counters, gauges, labels, and histogram buckets as OpenMetrics text', () => {
    const registry = createMetricsRegistry();

    registry.increment('vaultstack_http_requests_total', {
      method: 'GET',
      route: '/api/v1/ready',
      status: 200,
    });
    registry.set('vaultstack_database_up', 1);
    registry.observe('vaultstack_http_request_duration_seconds', 0.02, {
      method: 'GET',
      route: '/api/v1/ready',
    });

    const output = registry.render();

    expect(output).toContain('# TYPE vaultstack_http_requests_total counter');
    expect(output).toContain(
      'vaultstack_http_requests_total{method="GET",route="/api/v1/ready",status="200"} 1',
    );
    expect(output).toContain('vaultstack_database_up 1');
    expect(output).toContain(
      'vaultstack_http_request_duration_seconds_bucket{method="GET",route="/api/v1/ready",le="+Inf"} 1',
    );
    expect(output).toContain(
      'vaultstack_http_request_duration_seconds_count{method="GET",route="/api/v1/ready"} 1',
    );
  });
});
