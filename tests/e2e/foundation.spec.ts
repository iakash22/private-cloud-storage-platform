import { expect, test } from '@playwright/test';

test.describe('VaultStack foundation', () => {
  test('dashboard renders VaultStack title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'VaultStack' })).toBeVisible();
  });

  test('api health endpoint responds', async ({ request }) => {
    const response = await request.get(`http://127.0.0.1:3000/health`);
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('api');
  });
});
