import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** User-local NSS/ALSA libs extracted when apt packages are not installed system-wide. */
export function playwrightHostLibDir(): string {
  return join(homedir(), '.cache/ms-playwright/host-libs/usr/lib/x86_64-linux-gnu');
}

export function applyPlaywrightHostLibraries(): void {
  const dir = playwrightHostLibDir();
  if (!existsSync(dir)) {
    return;
  }
  process.env.LD_LIBRARY_PATH = [dir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}
