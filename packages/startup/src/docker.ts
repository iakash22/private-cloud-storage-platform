import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const VAULTSTACK_CONTAINERS = [
  'vaultstack-postgres',
  'vaultstack-redis',
  'vaultstack-minio',
] as const;

export type VaultstackContainerName = (typeof VAULTSTACK_CONTAINERS)[number];

export type ContainerState = 'up' | 'down' | 'unknown';

export interface ContainerStatus {
  name: VaultstackContainerName;
  state: ContainerState;
  detail: string;
}

export type DockerRunner = (args: readonly string[]) => Promise<string>;

const DOCKER_CANDIDATES = [
  'docker',
  '/usr/bin/docker',
  '/usr/local/bin/docker',
  '/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe',
];

async function resolveDockerBin(): Promise<string> {
  for (const candidate of DOCKER_CANDIDATES) {
    if (candidate !== 'docker' && !existsSync(candidate)) {
      continue;
    }

    try {
      await execFileAsync(candidate, ['version', '--format', '{{.Client.Version}}'], {
        timeout: 2500,
        maxBuffer: 16 * 1024,
        windowsHide: true,
      });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('docker CLI missing');
}

export async function defaultDockerRunner(args: readonly string[]): Promise<string> {
  const binary = await resolveDockerBin();
  const { stdout } = await execFileAsync(binary, [...args], {
    timeout: 4000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export function parseDockerPsOutput(
  output: string,
): Map<string, { status: string; ports: string }> {
  const rows = new Map<string, { status: string; ports: string }>();

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const [name, status = '', ports = ''] = trimmed.split('\t');
    if (name) {
      rows.set(name.replace(/^\//, ''), { status, ports });
    }
  }

  return rows;
}

function classifyContainer(status: string | undefined): { state: ContainerState; detail: string } {
  if (!status) {
    return { state: 'down', detail: 'not created' };
  }

  const lower = status.toLowerCase();
  if (lower.startsWith('up')) {
    return { state: 'up', detail: lower.includes('unhealthy') ? 'unhealthy' : 'up' };
  }

  return { state: 'down', detail: lower.includes('exited') ? 'exited' : 'down' };
}

export async function inspectVaultstackContainers(
  runDocker: DockerRunner = defaultDockerRunner,
): Promise<{ available: boolean; containers: ContainerStatus[] }> {
  try {
    const output = await runDocker([
      'ps',
      '-a',
      '--filter',
      'name=vaultstack-',
      '--format',
      '{{.Names}}\t{{.Status}}\t{{.Ports}}',
    ]);
    const rows = parseDockerPsOutput(output);

    return {
      available: true,
      containers: VAULTSTACK_CONTAINERS.map((name) => {
        const row = rows.get(name);
        const classified = classifyContainer(row?.status);
        return {
          name,
          state: classified.state,
          detail: classified.detail,
        };
      }),
    };
  } catch {
    return {
      available: false,
      containers: VAULTSTACK_CONTAINERS.map((name) => ({
        name,
        state: 'unknown',
        detail: 'docker CLI unavailable',
      })),
    };
  }
}
