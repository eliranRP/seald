import { test, expect, type Route } from '@playwright/test';

/**
 * Owner approval from the email link (WP-22, flag `mcpServer`).
 *
 * The owner opens `/approve#<token>`. The page reads the token from the
 * fragment, removes it from the address bar, previews the request (this
 * never decides), and only a button press sends Approve or Deny with the
 * CSRF value. A request that needs a session sends the owner to sign-in
 * with `?next=` set to the review. Every `/approvals/*` call is intercepted
 * with `page.route`; there is no backend.
 */

const TOKEN = 'T'.repeat(43);
const CSRF = 'C'.repeat(43);
const APPROVAL_ID = '11111111-1111-4111-8111-111111111111';

const KNOWN = [
  { name: 'Ada Lovelace', email: 'ada@example.org', is_new: false },
  { name: 'Grace Hopper', email: 'grace@example.org', is_new: false },
];

function summary(recipients = KNOWN) {
  return {
    kind: 'envelope_send',
    action_label: 'Send for signature',
    title: 'Services agreement',
    recipients,
    page_count: 3,
    key_name: 'Key 2',
    approver_email: 'owner@example.org',
    destination: null,
  };
}

function pendingCard(overrides: Record<string, unknown> = {}) {
  return {
    state: 'pending',
    approval_id: APPROVAL_ID,
    summary: summary(),
    approve_requires: 'link',
    expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    fields_updated_at: null,
    result_slug: null,
    review_url: `http://127.0.0.1:5173/approve/${APPROVAL_ID}/review`,
    csrf: CSRF,
    ...overrides,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test.describe('approve from the email link', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const host = window as unknown as {
        __SEALD_CONSENT_DISABLED: boolean;
        __SEALD_FEATURE_OVERRIDES__: Record<string, boolean>;
      };
      host.__SEALD_CONSENT_DISABLED = true;
      host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
    });
  });

  test('previews without deciding, strips the token, then Approve posts the decision with the CSRF value', async ({
    page,
  }) => {
    const previews: unknown[] = [];
    const decisions: unknown[] = [];
    await page.route('**/approvals/from-email/preview', (route) => {
      previews.push(route.request().postDataJSON());
      return json(route, 200, pendingCard());
    });
    await page.route('**/approvals/from-email', (route) => {
      decisions.push(route.request().postDataJSON());
      return json(route, 200, {
        ...pendingCard({ state: 'done', csrf: undefined }),
        decided: true,
      });
    });

    await page.goto(`/approve#${TOKEN}`);

    await expect(page.getByRole('heading', { name: 'Send for signature' })).toBeVisible();
    await expect(page.getByText('Services agreement')).toBeVisible();
    await expect(page.getByText('Sent via Key 2')).toBeVisible();
    // The token left the address bar, and loading the page decided nothing.
    expect(page.url()).not.toContain(TOKEN);
    expect(new URL(page.url()).hash).toBe('');
    expect(previews).toEqual([{ token: TOKEN }]);
    expect(decisions).toEqual([]);

    await page.getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByRole('status', { name: 'Approved' })).toBeVisible();
    expect(decisions).toEqual([{ token: TOKEN, decision: 'approve', csrf: CSRF }]);
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  test('Deny posts the decision and offers to revoke the key', async ({ page }) => {
    const decisions: unknown[] = [];
    await page.route('**/approvals/from-email/preview', (route) => json(route, 200, pendingCard()));
    await page.route('**/approvals/from-email', (route) => {
      decisions.push(route.request().postDataJSON());
      return json(route, 200, {
        ...pendingCard({ state: 'denied', csrf: undefined }),
        decided: true,
      });
    });

    await page.goto(`/approve?intent=deny#${TOKEN}`);
    // ?intent=deny only pre-focuses Deny.
    await expect(page.getByRole('button', { name: 'Deny' })).toBeFocused();
    expect(decisions).toEqual([]);

    await page.getByRole('button', { name: 'Deny' }).click();

    await expect(page.getByRole('status', { name: 'Denied' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Revoke this key' })).toBeVisible();
    expect(decisions).toEqual([{ token: TOKEN, decision: 'deny', csrf: CSRF }]);
  });

  test('a new recipient needs a session: the main button signs in with ?next= set to the review', async ({
    page,
  }) => {
    const decisions: unknown[] = [];
    await page.route('**/approvals/from-email/preview', (route) =>
      json(
        route,
        200,
        pendingCard({
          approve_requires: 'session',
          summary: summary([
            ...KNOWN,
            { name: 'Linus Torvalds', email: 'linus@example.org', is_new: true },
          ]),
        }),
      ),
    );
    await page.route('**/approvals/from-email', (route) => {
      decisions.push(route.request().postDataJSON());
      return json(route, 403, { error: 'session_required' });
    });

    await page.goto(`/approve#${TOKEN}`);

    await expect(page.getByText('New', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign in to approve' }).click();

    await expect(page).toHaveURL(/\/signin\?next=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get('next') ?? '')).toBe(
      `/approve/${APPROVAL_ID}/review`,
    );
    expect(decisions).toEqual([]);
  });

  test('the server can still require a session at decision time', async ({ page }) => {
    await page.route('**/approvals/from-email/preview', (route) => json(route, 200, pendingCard()));
    await page.route('**/approvals/from-email', (route) =>
      json(route, 403, { error: 'session_required' }),
    );

    await page.goto(`/approve#${TOKEN}`);
    await page.getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByRole('alert')).toContainText('needs you to sign in');
    await expect(page.getByRole('button', { name: 'Sign in to approve' })).toBeVisible();
  });

  for (const [state, name] of [
    ['expired', 'Expired'],
    ['superseded', 'Updated, see the newest email'],
    ['done', 'Approved'],
    ['denied', 'Denied'],
  ] as const) {
    test(`an already ${state} link shows "${name}" with nothing to press`, async ({ page }) => {
      await page.route('**/approvals/from-email/preview', (route) =>
        json(route, 200, pendingCard({ state, csrf: undefined })),
      );
      await page.goto(`/approve#${TOKEN}`);
      await expect(page.getByRole('status', { name })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Deny' })).toHaveCount(0);
    });
  }

  test('a failed approval shows why and that nothing was sent', async ({ page }) => {
    await page.route('**/approvals/from-email/preview', (route) =>
      json(
        route,
        200,
        pendingCard({ state: 'failed', result_slug: 'api_key_revoked', csrf: undefined }),
      ),
    );
    await page.goto(`/approve#${TOKEN}`);
    const failed = page.getByRole('status', { name: 'Failed' });
    await expect(failed).toContainText('The key that asked was revoked');
    await expect(failed).toContainText('nothing was sent');
  });

  test('a link without a token calls nothing', async ({ page }) => {
    let calls = 0;
    // Scoped to the API base: a bare `**/approvals/**` would also match the dev
    // server's own `features/approvals/*.tsx` module requests.
    await page.route('**/api/approvals/**', (route) => {
      calls += 1;
      return json(route, 200, pendingCard());
    });
    await page.goto('/approve');
    await expect(page.getByRole('status', { name: 'Expired' })).toContainText('incomplete');
    expect(calls).toBe(0);
  });

  test('renders the card at a phone and a desktop width', async ({ page }, testInfo) => {
    await page.route('**/approvals/from-email/preview', (route) =>
      json(
        route,
        200,
        pendingCard({
          summary: summary([
            ...KNOWN,
            { name: 'Alan Turing', email: 'alan@example.org', is_new: false },
            { name: 'Edsger Dijkstra', email: 'edsger@example.org', is_new: false },
          ]),
        }),
      ),
    );
    for (const [label, width, height] of [
      ['390', 390, 844],
      ['1440', 1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      // A fresh document each time: only a hash change would not reload the app.
      await page.goto('about:blank');
      await page.goto(`/approve#${TOKEN}`);
      await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
      await page.getByRole('button', { name: '+1 more' }).click();
      // No horizontal scroll at either width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: testInfo.outputPath(`approve-${label}.png`), fullPage: true });
    }
  });
});
