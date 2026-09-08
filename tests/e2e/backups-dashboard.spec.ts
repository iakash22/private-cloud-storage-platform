import { expect, test } from '@playwright/test';

test.describe('VaultStack backup dashboard', () => {
  test('create backup → monitor → complete → snapshot → restore', async ({ page }) => {
    const email = `backup-e2e-${Date.now()}@example.com`;
    const password = 'password123';

    await page.goto('/login');
    await page.getByRole('button', { name: 'Need an account? Register' }).click();
    await page.getByLabel('Name').fill('Backup User');
    await page.getByLabel('Organization').fill('Backup Org');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Storage overview' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Backups' }).click();
    await expect(page.getByRole('heading', { name: 'Backup overview' })).toBeVisible();

    await page.getByRole('button', { name: 'Create backup' }).click();
    await page.getByRole('link', { name: 'Jobs' }).click();
    await expect(page.getByText('COMPLETED').first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole('link', { name: 'Snapshots' }).click();
    await expect(page.getByText('verified').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: 'Restore' }).click();
    await page.getByRole('button', { name: 'Start restore' }).click();
    await page.getByLabel('Snapshot').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('COMPLETED').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/plan only/i).first()).toBeVisible();
  });
});
