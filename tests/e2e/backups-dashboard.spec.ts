import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';

const apiBase = 'http://localhost:3000';

async function expectOk(response: APIResponse, label: string): Promise<void> {
  if (response.ok()) {
    return;
  }

  throw new Error(`${label} failed: ${response.status()} ${await response.text()}`);
}

function cookieHeader(response: APIResponse): string {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value.split(';')[0])
    .join('; ');
}

async function loginCookies(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ cookies: string; csrfToken: string; organizationId: string }> {
  const loginResponse = await request.post(`${apiBase}/api/v1/auth/login`, {
    data: { email, password },
  });
  await expectOk(loginResponse, 'login');
  const body = (await loginResponse.json()) as {
    organizations: { id: string }[];
    csrfToken: string;
  };
  const organizationId = body.organizations[0]?.id;
  if (!organizationId) {
    throw new Error('login did not return an organization');
  }
  return {
    cookies: cookieHeader(loginResponse),
    csrfToken: body.csrfToken,
    organizationId,
  };
}

async function pollUntil<T>(
  load: () => Promise<T>,
  match: (value: T) => boolean,
  label: string,
  timeoutMs = 90_000,
): Promise<T> {
  const started = Date.now();
  let last: T | undefined;
  while (Date.now() - started < timeoutMs) {
    last = await load();
    if (match(last)) {
      return last;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1_000);
    });
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

async function refreshUntilVisible(page: Page, text: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (
      await page
        .getByText(text)
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    const refresh = page.getByRole('button', { name: 'Refresh' });
    if (await refresh.isVisible().catch(() => false)) {
      await refresh.click();
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error(`Timed out waiting for "${text}"`);
}

test.describe('VaultStack backups dashboard', () => {
  test('register → /backups → org-target backup → snapshot verified → restore plan', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const email = `backups-e2e-${Date.now()}@example.com`;
    const password = 'password123';

    await page.goto('/login');
    await page.getByRole('button', { name: 'Create one' }).click();
    await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible();
    await page.getByLabel('Name').fill('Backup E2E User');
    await page.getByLabel('Organization').fill('Backup E2E Org');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('link', { name: 'Backups', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Backup overview' })).toBeVisible();

    const [createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/backups/jobs') &&
          response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Create backup' }).click(),
    ]);
    expect(
      createResponse.ok(),
      `create backup failed: ${createResponse.status()} ${await createResponse.text()}`,
    ).toBeTruthy();
    await refreshUntilVisible(page, 'Latest job', 60_000);

    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Backup jobs' })).toBeVisible();
    await refreshUntilVisible(page, 'COMPLETED');
    await expect(page.getByText('FAILED')).toHaveCount(0);
    await expect(page.getByText('Status: COMPLETED')).toBeVisible();

    const session = await loginCookies(request, email, password);
    const headers = {
      Cookie: session.cookies,
      'x-csrf-token': session.csrfToken,
      'x-vaultstack-organization': session.organizationId,
    };

    const jobs = await pollUntil(
      async () => {
        const response = await request.get(`${apiBase}/api/v1/backups/jobs`, { headers });
        await expectOk(response, 'list backup jobs');
        return ((await response.json()) as { jobs: { status: string }[] }).jobs;
      },
      (list) => list.some((job) => job.status === 'COMPLETED'),
      'backup job COMPLETED',
    );
    expect(jobs.some((job) => job.status === 'FAILED')).toBeFalsy();

    await page.getByRole('link', { name: 'Snapshots', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Snapshots' })).toBeVisible();
    await expect(page.getByText('No snapshots yet.')).toHaveCount(0);
    await expect(page.getByText('verified', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Verify' }).first().click();
    await expect(page.getByText('Verification passed')).toBeVisible({ timeout: 30_000 });

    const snapshots = await request.get(`${apiBase}/api/v1/backups/snapshots`, { headers });
    await expectOk(snapshots, 'list snapshots');
    const snapshotList = (
      (await snapshots.json()) as {
        snapshots: { id: string; verificationPassed: boolean }[];
      }
    ).snapshots;
    expect(snapshotList.length).toBeGreaterThan(0);
    expect(snapshotList[0]?.verificationPassed).toBe(true);
    const snapshotId = snapshotList[0]?.id;
    expect(snapshotId).toBeTruthy();

    await page.getByRole('link', { name: 'Restore', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Restore', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start restore' }).click();
    const snapshotTrigger = page.getByRole('button', { name: 'Snapshot' });
    await expect(snapshotTrigger).toBeEnabled({ timeout: 15_000 });
    await snapshotTrigger.click();
    await page.getByRole('option', { name: snapshotId! }).click();
    await expect(snapshotTrigger).toContainText(snapshotId!);
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Restore', exact: true })).toBeVisible();
    await refreshUntilVisible(page, 'COMPLETED');
    await expect(page.getByText(/Destructive:/)).toBeVisible({ timeout: 15_000 });

    await pollUntil(
      async () => {
        const response = await request.get(`${apiBase}/api/v1/backups/restore`, { headers });
        await expectOk(response, 'list restore jobs');
        return (
          (await response.json()) as {
            restores: { status: string; restorePlan: unknown }[];
          }
        ).restores;
      },
      (list) => list.some((job) => job.status === 'COMPLETED' && job.restorePlan !== null),
      'restore job COMPLETED with plan',
    );
  });
});
