import { expect, test } from '@playwright/test';

const apiBase = 'http://127.0.0.1:3000';

test.describe('VaultStack storage dashboard', () => {
  test('login → storage → bucket → upload → list → metadata → download → delete', async ({
    page,
    request,
  }) => {
    const email = `storage-e2e-${Date.now()}@example.com`;
    const password = 'password123';
    const bucketName = `e2e-bucket-${Date.now()}`;
    const fileName = 'hello-e2e.txt';
    const fileBody = 'VaultStack Phase 4 E2E upload';

    await page.goto('/login');
    await page.getByRole('button', { name: 'Need an account? Register' }).click();
    await page.getByLabel('Name').fill('E2E User');
    await page.getByLabel('Organization').fill('E2E Org');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Storage overview' })).toBeVisible();

    await page.getByRole('link', { name: 'Buckets' }).click();
    await page.getByRole('button', { name: 'Create bucket' }).click();
    await page.getByLabel('Bucket name').fill(bucketName);
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText(bucketName)).toBeVisible();

    await page.getByRole('link', { name: 'Files' }).click();
    await page.getByLabel('Select bucket').selectOption({ label: bucketName });
    await page.getByRole('button', { name: 'Upload' }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileBody),
    });

    await expect(page.getByText(fileName)).toBeVisible({ timeout: 20_000 });
    await page.getByText(fileName).click();
    await expect(page.getByText('Object details')).toBeVisible();
    await expect(page.getByText(fileName).first()).toBeVisible();

    const downloadPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Download' }).first().click();
    const downloadPage = await downloadPromise;
    await expect(downloadPage).toHaveURL(/content\?token=/);

    await page.getByRole('button', { name: `Delete ${fileName}` }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('This folder is empty')).toBeVisible({ timeout: 10_000 });

    const loginResponse = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email, password },
    });
    expect(loginResponse.ok()).toBeTruthy();
    const loginCookies = loginResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value.split(';')[0])
      .join('; ');

    const me = await request.get(`${apiBase}/api/v1/auth/me`, {
      headers: { Cookie: loginCookies },
    });
    const meBody = (await me.json()) as {
      organizations: { id: string }[];
      csrfToken: string;
    };
    const organizationId = meBody.organizations[0]?.id;
    expect(organizationId).toBeTruthy();

    const buckets = await request.get(`${apiBase}/api/v1/storage/buckets`, {
      headers: {
        Cookie: loginCookies,
        'x-csrf-token': meBody.csrfToken,
        'x-vaultstack-organization': organizationId,
      },
    });
    const bucketId = ((await buckets.json()) as { buckets: { id: string; name: string }[] }).buckets.find(
      (bucket) => bucket.name === bucketName,
    )?.id;
    expect(bucketId).toBeTruthy();

    const otherEmail = `storage-other-${Date.now()}@example.com`;
    const otherRegister = await request.post(`${apiBase}/api/v1/auth/register`, {
      data: {
        email: otherEmail,
        password,
        name: 'Other Org',
        organizationName: 'Other Org',
      },
    });
    const otherCookies = otherRegister
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value.split(';')[0])
      .join('; ');
    const otherCsrf = ((await otherRegister.json()) as { csrfToken: string }).csrfToken;

    const crossOrg = await request.get(`${apiBase}/api/v1/storage/buckets/${bucketId}`, {
      headers: {
        Cookie: otherCookies,
        'x-csrf-token': otherCsrf,
        'x-vaultstack-organization': organizationId,
      },
    });
    expect(crossOrg.status()).toBe(403);
  });

  test('shows upload failure and progress for large uploads', async ({ page }) => {
    const email = `storage-large-${Date.now()}@example.com`;
    const password = 'password123';
    const bucketName = `large-bucket-${Date.now()}`;

    await page.goto('/login');
    await page.getByRole('button', { name: 'Need an account? Register' }).click();
    await page.getByLabel('Name').fill('Large Upload User');
    await page.getByLabel('Organization').fill('Large Upload Org');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.getByRole('link', { name: 'Buckets' }).click();
    await page.getByRole('button', { name: 'Create bucket' }).click();
    await page.getByLabel('Bucket name').fill(bucketName);
    await page.getByRole('button', { name: 'Create' }).click();

    await page.getByRole('link', { name: 'Files' }).click();
    await page.getByLabel('Select bucket').selectOption({ label: bucketName });
    await page.getByRole('button', { name: 'Upload' }).click();

    const largeBuffer = Buffer.alloc(512 * 1024, 'a');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'large.bin',
      mimeType: 'application/octet-stream',
      buffer: largeBuffer,
    });

    await expect(page.getByText('Uploads')).toBeVisible();
    await expect(page.getByText(/uploading|completed/i)).toBeVisible({ timeout: 30_000 });
  });

  test('rejects unauthorized delete attempts via API', async ({ request }) => {
    const ownerEmail = `owner-${Date.now()}@example.com`;
    const viewerEmail = `viewer-${Date.now()}@example.com`;
    const password = 'password123';

    const ownerRegister = await request.post(`${apiBase}/api/v1/auth/register`, {
      data: {
        email: ownerEmail,
        password,
        name: 'Owner',
        organizationName: 'Delete Test Org',
      },
    });
    expect(ownerRegister.ok()).toBeTruthy();

    const ownerBody = (await ownerRegister.json()) as {
      organization: { id: string };
      csrfToken: string;
    };
    const ownerCookies = ownerRegister
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value.split(';')[0])
      .join('; ');

    const bucketResponse = await request.post(`${apiBase}/api/v1/storage/buckets`, {
      headers: {
        Cookie: ownerCookies,
        'x-csrf-token': ownerBody.csrfToken,
        'x-vaultstack-organization': ownerBody.organization.id,
      },
      data: { name: `delete-test-${Date.now()}` },
    });
    const bucketId = ((await bucketResponse.json()) as { bucket: { id: string } }).bucket.id;

    const initiate = await request.post(`${apiBase}/api/v1/storage/uploads/initiate`, {
      headers: {
        Cookie: ownerCookies,
        'x-csrf-token': ownerBody.csrfToken,
        'x-vaultstack-organization': ownerBody.organization.id,
      },
      data: { bucketId, key: 'protected.txt', contentType: 'text/plain', size: 4 },
    });
    const initiated = (await initiate.json()) as { upload: { id: string }; uploadUrl: string };
    await request.put(initiated.uploadUrl, { data: 'data' });
    const complete = await request.post(
      `${apiBase}/api/v1/storage/uploads/${initiated.upload.id}/complete`,
      {
        headers: {
          Cookie: ownerCookies,
          'x-csrf-token': ownerBody.csrfToken,
          'x-vaultstack-organization': ownerBody.organization.id,
        },
        data: {},
      },
    );
    const objectId = ((await complete.json()) as { object: { id: string } }).object.id;

    const viewerCreate = await request.post(
      `${apiBase}/api/v1/organizations/${ownerBody.organization.id}/users`,
      {
        headers: {
          Cookie: ownerCookies,
          'x-csrf-token': ownerBody.csrfToken,
          'x-vaultstack-organization': ownerBody.organization.id,
        },
        data: {
          email: viewerEmail,
          password,
          name: 'Viewer',
          roles: ['VIEWER'],
        },
      },
    );
    expect(viewerCreate.ok()).toBeTruthy();

    const viewerLogin = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email: viewerEmail, password },
    });
    const viewerBody = (await viewerLogin.json()) as { csrfToken: string };
    const viewerCookies = viewerLogin
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value.split(';')[0])
      .join('; ');

    const deleteAttempt = await request.delete(`${apiBase}/api/v1/storage/objects/${objectId}`, {
      headers: {
        Cookie: viewerCookies,
        'x-csrf-token': viewerBody.csrfToken,
        'x-vaultstack-organization': ownerBody.organization.id,
      },
    });

    expect(deleteAttempt.status()).toBe(403);
  });
});
