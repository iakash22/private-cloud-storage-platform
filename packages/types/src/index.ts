export type HealthStatus = 'ok' | 'degraded' | 'error';

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  uptime: number;
}

export interface DependencyCheck {
  name: string;
  status: HealthStatus;
  message?: string;
}

export interface ReadinessResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  checks: DependencyCheck[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
