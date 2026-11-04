import { test, expect, type Route } from '@playwright/test';

/**
 * Template direct link, public flow (WP-37, flag `directLinks`).
 *
 * A visitor opens `/d/<token>`, sees only the template title and the sender
 * name, enters a name and an email, and is told to check their inbox. The
 * claim call carries exactly those two fields. A link that is off, rotated
 * away or unknown shows one "not available" page. A rate limit keeps the
 * form so the visitor can retry later. All `/api/direct-links/*` calls are
 * intercepted with `page.route`; there is no backend.
 */

const TOKEN = `dl_${'a'.repeat(43)}`;
const GONE_TOKEN = `dl_${'b'.repeat(43)}`;
const LIMITED_TOKEN = `dl_${'c'.repeat(43)}`;

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

test.describe('template direct link (public)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const host = window as unknown as {
        __SEALD_CONSENT_DISABLED: boolean;
        __SEALD_FEATURE_OVERRIDES__: Record<string, boolean>;
      };
      host.__SEALD_CONSENT_DISABLED = true;
      host.__SEALD_FEATURE_OVERRIDES__ = { directLinks: true };
    });
  });

  test('shows the template and sender, takes a name and email, and asks them to check their inbox', async ({
    page,
  }) => {
    let claimBody: unknown = null;
    await page.route(`**/direct-links/${TOKEN}`, (route) =>
      json(route, 200, { template_title: 'Consulting agreement', sender_name: 'Olive Owner' }),
    );
    await page.route(`**/direct-links/${TOKEN}/claim`, (route) => {
      claimBody = route.request().postDataJSON();
      return json(route, 200, { status: 'check_your_email' });
    });

    // Query-string values must not prefill anything.
    await page.goto(`/d/${TOKEN}?name=Eve&email=eve@example.org`);

    await expect(page.getByRole('heading', { name: 'Consulting agreement' })).toBeVisible();
    await expect(page.getByText('Olive Owner asks you to sign this document.')).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('');
    await expect(page.getByLabel('Your email')).toHaveValue('');

    await page.getByLabel('Your name').fill('Ada Lovelace');
    await page.getByLabel('Your email').fill('ada@example.org');
    await page.getByRole('button', { name: 'Email me the signing link' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/ada@example\.org/)).toBeVisible();
    expect(claimBody).toEqual({ name: 'Ada Lovelace', email: 'ada@example.org' });
    // The visitor never lands in the signing flow without the emailed link.
    expect(page.url()).toContain(`/d/${TOKEN}`);
  });

  test('validates the form before calling the API', async ({ page }) => {
    let claims = 0;
    await page.route(`**/direct-links/${TOKEN}`, (route) =>
      json(route, 200, { template_title: 'Consulting agreement', sender_name: 'A Seald user' }),
    );
    await page.route(`**/direct-links/${TOKEN}/claim`, (route) => {
      claims += 1;
      return json(route, 200, { status: 'check_your_email' });
    });
    await page.goto(`/d/${TOKEN}`);

    await page.getByRole('button', { name: 'Email me the signing link' }).click();
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await page.getByLabel('Your name').fill('Ada');
    await page.getByLabel('Your email').fill('not-an-email');
    await page.getByRole('button', { name: 'Email me the signing link' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Enter a full email address, like name@example.com.',
    );
    expect(claims).toBe(0);
  });

  test('shows one "not available" page for a link that is off, rotated away or unknown', async ({
    page,
  }) => {
    await page.route(`**/direct-links/${GONE_TOKEN}`, (route) =>
      json(route, 404, { message: 'not_found' }),
    );
    await page.goto(`/d/${GONE_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'This link is not available' })).toBeVisible();
    await expect(page.getByLabel('Your email')).toHaveCount(0);
  });

  test('keeps the form and explains a rate limit', async ({ page }) => {
    await page.route(`**/direct-links/${LIMITED_TOKEN}`, (route) =>
      json(route, 200, { template_title: 'Consulting agreement', sender_name: 'Olive Owner' }),
    );
    await page.route(`**/direct-links/${LIMITED_TOKEN}/claim`, (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '600' },
        contentType: 'application/json',
        body: JSON.stringify({ message: 'rate_limited' }),
      }),
    );
    await page.goto(`/d/${LIMITED_TOKEN}`);
    await page.getByLabel('Your name').fill('Ada');
    await page.getByLabel('Your email').fill('ada@example.org');
    await page.getByRole('button', { name: 'Email me the signing link' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many requests');
    await expect(page.getByLabel('Your email')).toHaveValue('ada@example.org');
  });

  test('keeps the token out of search engines and referrers', async ({ page }) => {
    await page.route(`**/direct-links/${TOKEN}`, (route) =>
      json(route, 200, { template_title: 'Consulting agreement', sender_name: 'Olive Owner' }),
    );
    await page.goto(`/d/${TOKEN}`);
    await expect(page.getByRole('heading', { name: 'Consulting agreement' })).toBeVisible();
    // The SPA shell carries noindex, nofollow; the page adds no-referrer.
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  });
});
