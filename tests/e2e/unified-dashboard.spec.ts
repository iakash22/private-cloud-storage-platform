import { expect, test } from '@playwright/test';

test.describe('VaultStack unified dashboard', () => {
  test('keeps navigation usable on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    await page.getByRole('button', { name: 'Need an account? Register' }).click();
    await page.getByLabel('Name').fill('Dashboard User');
    await page.getByLabel('Organization').fill(`Dashboard Org ${Date.now()}`);
    await page.getByLabel('Email').fill(`dashboard-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    });
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Storage', exact: true })).toBeVisible();
    await expect(page.getByText('Logical object bytes')).toBeVisible();

    const bodyWidth = await page.locator('body').evaluate((body) => ({
      clientWidth: body.clientWidth,
      scrollWidth: body.scrollWidth,
    }));
    expect(bodyWidth.scrollWidth).toBeLessThanOrEqual(bodyWidth.clientWidth + 1);
  });
});
