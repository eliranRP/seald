import { expect, test, type Page, type Route } from '@playwright/test';
import { SeededUserFixture } from './fixtures/seededUser';

const SECRET = 'seald_live_abcd1234secretShownOnceOnlyXXXX';
const PREFIX = 'seald_live_abcd1234';
const KEY_ID = 'key-e2e-1';

test.describe('agent access keys', () => {
  test('creates a key, copies the secret, and revokes it', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __SEALD_CONSENT_DISABLED?: boolean }).__SEALD_CONSENT_DISABLED = true;
      (
        globalThis as { __SEALD_FEATURE_OVERRIDES__?: { mcpServer?: boolean } }
      ).__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
    });
    await new SeededUserFixture(page).signInAs();
    await installKeyMocks(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://127.0.0.1:5173',
    });

    await page.goto('/settings/developers');
    await expect(page.getByRole('heading', { name: 'Developers' })).toBeVisible();
    await expect(page.getByText('No keys yet.')).toBeVisible();

    await page.getByRole('button', { name: 'New key' }).click();
    const sheet = page.getByRole('dialog', { name: 'New key' });
    await expect(sheet).toContainText(SECRET);
    await page.getByRole('button', { name: 'Copy key' }).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe(SECRET);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText(SECRET)).toHaveCount(0);
    await expect(page.getByText(PREFIX)).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Revoke Key 1?' });
    await expect(confirm).toContainText(`Apps using ${PREFIX} stop working now.`);
    await confirm.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('status')).toHaveText('Key revoked.');
    await expect(page.getByText(PREFIX)).toHaveCount(0);
    await expect(page.getByText('No keys yet.')).toBeVisible();
  });
});

async function installKeyMocks(page: Page): Promise<void> {
  let keys: Array<Record<string, unknown>> = [];

  const user = {
    id: '00000000-0000-4000-8000-000000000a11',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'alice@example.com',
  };
  await page.route('**/auth/v1/token**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 2_000_000_000,
        expires_at: Math.floor(new Date('2099-12-31T00:00:00.000Z').getTime() / 1000),
        user,
      }),
    });
  });
  await page.route('**/auth/v1/user**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  await page.route(/^http:\/\/127\.0\.0\.1:5173\/api\//, async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'POST' && /\/api\/me\/api-keys\/[^/]+\/revoke/.test(url)) {
      keys = keys.map((row) =>
        row.id === KEY_ID ? { ...row, revoked_at: '2026-09-30T12:00:00.000Z' } : row,
      );
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ revoked: true }),
      });
      return;
    }
    if (method === 'POST' && /\/api\/me\/api-keys(\?|$)/.test(url)) {
      const created = {
        id: KEY_ID,
        name: 'Key 1',
        prefix: PREFIX,
        scopes: ['envelopes:read'],
        require_owner_approval: true,
        allow_new_recipients: false,
        always_require_signin: false,
        created_at: '2026-09-30T12:00:00.000Z',
        last_used_at: null,
        expires_at: '2026-12-29T00:00:00.000Z',
        revoked_at: null,
        secret: SECRET,
      };
      keys = [created];
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
      return;
    }
    if (method === 'GET' && /\/api\/me\/api-keys(\?|$)/.test(url)) {
      const visible = keys
        .filter((row) => row.revoked_at == null)
        .map(({ secret: _secret, ...row }) => row);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(visible),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });
}
