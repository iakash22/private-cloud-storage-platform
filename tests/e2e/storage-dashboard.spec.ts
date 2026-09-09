import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

const apiBase = 'http://127.0.0.1:3000';
const MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;

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

async function registerOwner(
  request: APIRequestContext,
  email: string,
  organizationName: string,
): Promise<{ cookies: string; csrfToken: string; organizationId: string }> {
  const response = await request.post(`${apiBase}/api/v1/auth/register`, {
    data: {
      email,
      password: 'password123',
      name: 'Owner',
      organizationName,
    },
  });
  await expectOk(response, 'register');
  const body = (await response.json()) as {
    organization: { id: string };
    csrfToken: string;
  };
  return {
    cookies: cookieHeader(response),
    csrfToken: body.csrfToken,
    organizationId: body.organization.id,
  };
}

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

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: 'Storage', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Storage overview' })).toBeVisible();

    await page.getByRole('link', { name: 'Buckets', exact: true }).click();
    await page.getByRole('button', { name: 'Create bucket' }).click();
    await page.getByLabel('Bucket name').fill(bucketName);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('button', { name: bucketName })).toBeVisible();

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

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/hello-e2e/);

    await page.getByRole('button', { name: `Delete ${fileName}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('This folder is empty')).toBeVisible({ timeout: 10_000 });

    const loginResponse = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email, password },
    });
    await expectOk(loginResponse, 'login');
    const loginCookies = cookieHeader(loginResponse);

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
    const bucketId = (
      (await buckets.json()) as { buckets: { id: string; name: string }[] }
    ).buckets.find((bucket) => bucket.name === bucketName)?.id;
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
    await expectOk(otherRegister, 'cross-org register');
    const otherCookies = cookieHeader(otherRegister);
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

  test('shows upload progress for large multipart uploads', async ({ page }) => {
    test.setTimeout(120_000);
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

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('link', { name: 'Storage', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Storage overview' })).toBeVisible();
    await page.getByRole('link', { name: 'Buckets', exact: true }).click();
    await page.getByRole('button', { name: 'Create bucket' }).click();
    await page.getByLabel('Bucket name').fill(bucketName);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await page.getByRole('link', { name: 'Files' }).click();
    await page.getByLabel('Select bucket').selectOption({ label: bucketName });
    await page.getByRole('button', { name: 'Upload' }).click();

    const largeBuffer = Buffer.alloc(MULTIPART_THRESHOLD_BYTES, 'a');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'large.bin',
      mimeType: 'application/octet-stream',
      buffer: largeBuffer,
    });

    await expect(page.getByText('Uploads')).toBeVisible();
    await expect(page.getByText(/uploading|completing|completed/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('completed')).toBeVisible({ timeout: 60_000 });
  });

  test('rejects unauthorized delete attempts via API', async ({ request }) => {
    const ownerEmail = `owner-${Date.now()}@example.com`;
    const viewerEmail = `viewer-${Date.now()}@example.com`;
    const password = 'password123';

    const owner = await registerOwner(request, ownerEmail, 'Delete Test Org');
    const ownerHeaders = {
      Cookie: owner.cookies,
      'x-csrf-token': owner.csrfToken,
      'x-vaultstack-organization': owner.organizationId,
    };

    const bucketResponse = await request.post(`${apiBase}/api/v1/storage/buckets`, {
      headers: ownerHeaders,
      data: { name: `delete-test-${Date.now()}` },
    });
    await expectOk(bucketResponse, 'create bucket');
    const bucketId = ((await bucketResponse.json()) as { bucket: { id: string } }).bucket.id;

    const initiate = await request.post(`${apiBase}/api/v1/storage/uploads/initiate`, {
      headers: ownerHeaders,
      data: { bucketId, key: 'protected.txt', contentType: 'text/plain', size: 4 },
    });
    await expectOk(initiate, 'initiate upload');
    const initiated = (await initiate.json()) as { upload: { id: string }; uploadUrl: string };
    const put = await request.put(initiated.uploadUrl, {
      headers: { 'Content-Type': 'text/plain' },
      data: Buffer.from('data'),
    });
    await expectOk(put, 'put upload bytes');
    const complete = await request.post(
      `${apiBase}/api/v1/storage/uploads/${initiated.upload.id}/complete`,
      {
        headers: ownerHeaders,
        data: {},
      },
    );
    await expectOk(complete, 'complete upload');
    const objectId = ((await complete.json()) as { object: { id: string } }).object.id;

    const viewerCreate = await request.post(
      `${apiBase}/api/v1/organizations/${owner.organizationId}/users`,
      {
        headers: ownerHeaders,
        data: {
          email: viewerEmail,
          password,
          name: 'Viewer',
          roles: ['VIEWER'],
        },
      },
    );
    await expectOk(viewerCreate, 'create viewer');

    const viewerLogin = await request.post(`${apiBase}/api/v1/auth/login`, {
      data: { email: viewerEmail, password },
    });
    await expectOk(viewerLogin, 'viewer login');
    const viewerBody = (await viewerLogin.json()) as { csrfToken: string };
    const viewerCookies = cookieHeader(viewerLogin);

    const deleteAttempt = await request.delete(`${apiBase}/api/v1/storage/objects/${objectId}`, {
      headers: {
        Cookie: viewerCookies,
        'x-csrf-token': viewerBody.csrfToken,
        'x-vaultstack-organization': owner.organizationId,
      },
    });

    expect(deleteAttempt.status()).toBe(403);
  });
});
