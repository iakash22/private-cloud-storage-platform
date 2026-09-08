import { request as httpRequest } from 'node:http';
import type { EnvConfig } from '@vaultstack/config';
import type { PublicDockerMetrics } from '@vaultstack/types';
import type { DockerCollector } from '../domain/collectors.js';

interface DockerInfo {
  ServerVersion?: string;
  Containers?: number;
  ContainersRunning?: number;
  Images?: number;
}

interface DockerContainer {
  Id?: string;
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
}

const DOCKER_INFO_PATH = '/info';
const DOCKER_CONTAINERS_PATH = '/containers/json';

export class DockerSocketCollector implements DockerCollector {
  constructor(private readonly config: EnvConfig) {}

  async collect(): Promise<PublicDockerMetrics> {
    const collectedAt = new Date().toISOString();
    try {
      const [info, containers] = await Promise.all([
        dockerGet<DockerInfo>(this.config.DOCKER_SOCKET, DOCKER_INFO_PATH),
        dockerGet<DockerContainer[]>(this.config.DOCKER_SOCKET, DOCKER_CONTAINERS_PATH),
      ]);
      return {
        collectedAt,
        available: true,
        message: 'Docker Engine reachable',
        serverVersion: info.ServerVersion ?? null,
        containers: info.Containers ?? containers.length,
        containersRunning: info.ContainersRunning ?? containers.length,
        images: info.Images ?? null,
        items: containers.slice(0, 50).map((container) => ({
          id: (container.Id ?? '').slice(0, 12),
          name: container.Names?.[0]?.replace(/^\//, '') ?? 'unknown',
          image: container.Image ?? 'unknown',
          state: container.State ?? 'unknown',
          status: container.Status ?? 'unknown',
        })),
      };
    } catch (error) {
      return {
        collectedAt,
        available: false,
        message: error instanceof Error ? error.message : 'Docker unavailable',
        serverVersion: null,
        containers: null,
        containersRunning: null,
        images: null,
        items: [],
      };
    }
  }
}

function dockerGet<T>(socketPath: string, path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath,
        path,
        method: 'GET',
        timeout: 2_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Docker API ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error('Docker API returned invalid JSON'));
          }
        });
      },
    );
    req.on('error', (error) => {
      reject(error);
    });
    req.on('timeout', () => {
      req.destroy(new Error('Docker API timeout'));
    });
    req.end();
  });
}
