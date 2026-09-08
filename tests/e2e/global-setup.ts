import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyPlaywrightHostLibraries } from './chromium-host-libs.js';

/**
 * Playwright only boots the API and dashboard. Workspace packages export `dist/`,
 * so they must be built first. Postgres and Redis must already be healthy: auth
 * rate limiting and session-adjacent API traffic go through Redis, and register
 * writes to Postgres.
 */
export default function globalSetup(): void {
  applyPlaywrightHostLibraries();
  execSync(
    'pnpm exec turbo run build --filter=@vaultstack/api^... --filter=@vaultstack/dashboard^...',
    {
      stdio: 'inherit',
    },
  );
  execSync('pnpm docker:up', { stdio: 'inherit' });
  execSync('pnpm db:migrate', { stdio: 'inherit' });
  execSync('pnpm db:seed', { stdio: 'inherit' });
  if (process.env.PW_SKIP_BROWSER_DEPS !== '1') {
    assertChromiumLibraries();
  }
}

function assertChromiumLibraries(): void {
  const cache = join(homedir(), '.cache/ms-playwright');
  if (!existsSync(cache)) {
    return;
  }

  const binary = readdirSync(cache)
    .filter((entry) => entry.startsWith('chromium_headless_shell-'))
    .map((entry) =>
      join(cache, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    )
    .find((candidate) => existsSync(candidate));

  if (!binary) {
    return;
  }

  const output = execSync(`ldd ${JSON.stringify(binary)}`, { encoding: 'utf8' });
  if (!output.includes('not found')) {
    return;
  }

  throw new Error(
    'Playwright Chromium is missing OS libraries (e.g. libnspr4.so). From WSL run:\n  pnpm playwright:install-deps\nDo not prefix that command with sudo — pnpm lives in nvm and root cannot see it. Playwright will prompt for your password itself.',
  );
}
