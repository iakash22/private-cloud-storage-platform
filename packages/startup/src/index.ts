import { renderStartupBanner } from './banner.js';
import { collectStartupStatus, type StartupCheckInput, type StartupStatus } from './status.js';

export { renderStartupBanner } from './banner.js';
export { inspectVaultstackContainers, parseDockerPsOutput } from './docker.js';
export { probeTcp } from './probe.js';
export {
  parsePostgresTarget,
  parseRedisTarget,
  sanitizePublicMessage,
  shortStatusDetail,
} from './redact.js';
export { collectStartupStatus } from './status.js';
export type { ContainerStatus, DockerRunner } from './docker.js';
export type { StartupCheckInput, StartupStatus } from './status.js';

export interface PrintStartupBannerOptions extends StartupCheckInput {
  color?: boolean;
  writer?: (text: string) => void;
}

export function shouldPrintStartupBanner(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VAULTSTACK_STARTUP_BANNER === '0') {
    return false;
  }
  return env.NODE_ENV !== 'test';
}

export async function printStartupBanner(
  options: PrintStartupBannerOptions,
): Promise<StartupStatus | undefined> {
  if (!shouldPrintStartupBanner()) {
    return undefined;
  }

  const status = await collectStartupStatus(options);
  const tty = process.stdout.isTTY;
  const color = options.color ?? (typeof tty === 'boolean' ? tty : false);
  const output = renderStartupBanner(status, { color });
  const writer =
    options.writer ??
    ((text: string) => {
      process.stdout.write(`${text}\n`);
    });
  writer(output);
  return status;
}
