import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

/**
 * Step defs for `sender-lifecycle.feature` — the qa/sender-lifecycle-bdd
 * audit's three regressions:
 *   BUG-1 — dashboard had zero media queries (mobile clipped its grid)
 *   BUG-2 — sender date formatter dropped the year for cross-year dates
 *   BUG-3 — bundle download fired two `target="_blank"` anchors and the
 *           second was popup-blocked while the toast claimed both opened
 */

const { Given, When, Then } = createBdd(test);

const HISTORICAL_ID = 'env_historical';
const RECENT_ID = 'env_recent';
// BUG-2: pin the historical envelope to a calendar year that differs
// from the fixedNow fixture so the dashboard MUST emit "2024" alongside
// the day/month. The fixedNow fixture freezes time to 2026-05-02.
const HISTORICAL_SENT_AT = '2024-04-02T09:00:00Z';
const RECENT_SENT_AT = '2026-04-25T09:00:00Z';

function envelope(opts: {
  id: string;
  title: string;
  shortCode: string;
  sentAt: string;
  status?: string;
}) {
  return {
    id: opts.id,
    title: opts.title,
    short_code: opts.shortCode,
    status: opts.status ?? 'awaiting_others',
    original_pages: 1,
    sent_at: opts.sentAt,
    completed_at: null,
    expires_at: null,
    created_at: opts.sentAt,
    updated_at: opts.sentAt,
    signers: [
      {
        id: `${opts.id}_s1`,
        name: 'Bob Recipient',
        email: 'bob@example.com',
        color: '#3b82f6',
        role: 'signatory',
        signing_order: 1,
        status: 'awaiting',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      },
    ],
  };
}

Given(
  'a signed-in sender with a historical and a recent envelope',
  async ({ seededUser, mockedApi, fixedNow }) => {
    void fixedNow; // request the fixture so Date.now() is frozen
    await seededUser.signInAs();
    const historical = envelope({
      id: HISTORICAL_ID,
      title: 'Historical MSA',
      shortCode: 'HISTORIC1',
      sentAt: HISTORICAL_SENT_AT,
    });
    const recent = envelope({
      id: RECENT_ID,
      title: 'Recent NDA',
      shortCode: 'RECENT001',
      sentAt: RECENT_SENT_AT,
      status: 'completed',
    });
    mockedApi.on('GET', /\/api\/envelopes(\?|$)/, {
      json: { items: [recent, historical], next_cursor: null },
    });
    // Detail + events for BUG-3 navigation. `completed_at` makes the
    // bundle item available in the DownloadMenu.
    const recentDetail = {
      ...recent,
      completed_at: '2026-04-26T10:00:00Z',
    };
    mockedApi.on('GET', new RegExp(`/api/envelopes/${RECENT_ID}$`), {
      json: recentDetail,
    });
    mockedApi.on('GET', new RegExp(`/api/envelopes/${RECENT_ID}/events`), {
      json: { items: [] },
    });
    // The SPA appends `kind` as a query param. Register both kinds so
    // the bundle path's `Promise.all([sealed, audit])` resolves with
    // distinguishable URLs (the BUG-3 BDD asserts the popup is the
    // sealed one, NOT the audit which must download instead).
    mockedApi.on('GET', new RegExp(`/api/envelopes/${RECENT_ID}/download\\?kind=sealed`), {
      json: { url: 'https://signed.example/sealed.pdf', kind: 'sealed' },
    });
    mockedApi.on('GET', new RegExp(`/api/envelopes/${RECENT_ID}/download\\?kind=audit`), {
      json: { url: 'https://signed.example/audit.pdf', kind: 'audit' },
    });
  },
);

Given('the viewport is sized to an iPhone \\(375x812)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

When('the sender opens the dashboard', async ({ dashboardPage }) => {
  await dashboardPage.goto();
});

// Per-test bucket of popup events captured between the moment the
// download menu is opened and the assertions in the Then steps. Keyed
// by the Playwright `page` reference so parallel scenarios don't bleed
// into one another.
const popupBuckets = new WeakMap<object, string[]>();

When('the sender opens the recent envelope detail', async ({ page }) => {
  // EnvelopeDetailPage is mounted under `/document/:id` via DocumentRoute
  // — the route falls through to the detail page once the envelope is in
  // a sent / completed state (no local draft for it).
  // Stub the cross-origin signed.example download URLs so the audit
  // anchor's `download` attribute actually triggers a download (the
  // browser ignores `download` for cross-origin redirects, then would
  // navigate the SPA away and the success toast never renders).
  await page.route('https://signed.example/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: 'mock-pdf',
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': 'attachment; filename="mock.pdf"',
      },
    });
  });
  await page.goto(`/document/${RECENT_ID}`);
  // Start listening BEFORE the bundle click so we don't miss the popup
  // event (Playwright's `waitForEvent` needs to be registered before
  // the trigger fires; otherwise the event already left the queue).
  const bucket: string[] = [];
  popupBuckets.set(page, bucket);
  page.on('popup', (popup) => {
    bucket.push(popup.url());
  });
});

When('the sender chooses the {string} download bundle', async ({ page }, _label: string) => {
  // Open the split-button dropdown via its aria-label, then pick the
  // bundle row by its accessible role + visible name. The visible
  // title is "Full package" — matching loosely here so a copy tweak
  // doesn't make the BDD brittle.
  await page.getByRole('button', { name: /show all download options/i }).click();
  await page.getByRole('menuitem', { name: /full package/i }).click();
  // Allow the bundle path to fire its anchors + listeners to enqueue.
  await page.waitForTimeout(300);
});

// BUG-1 step defs (`Then the envelope row tiles do not overflow the
// viewport` + `Then the column-header strip is hidden`) were removed
// 2026-05-03 when the mobile dashboard scenario was rewritten to assert
// the redirect to /m/send. The dashboard never renders on a phone
// viewport now, so no overflow / column-header assertion applies. The
// "Then the URL is /m/send" step lives in sender-mobile.steps.ts.

Then('the row for the historical envelope shows its year', async ({ page }) => {
  // BUG-2: the row that points at HISTORICAL_SENT_AT (2024) must carry
  // "2024" in its rendered text. Without the fix only "Apr 02" would
  // appear and the year would be implicit, indistinguishable from a
  // current-year date.
  const row = page.getByRole('button', { name: /Historical MSA/i });
  await expect(row).toContainText('2024');
});

Then('the row for the recent envelope omits the year', async ({ page }) => {
  // The recent envelope is in the *current* calendar year (2026, per
  // fixedNow). The dashboard should keep the compact "Apr 25" form so
  // the table doesn't widen on every row.
  const row = page.getByRole('button', { name: /Recent NDA/i });
  await expect(row).not.toContainText('2026');
});

Then('exactly one new tab opens for the sealed PDF', async ({ page }) => {
  // The bundle path opens the sealed URL via a target="_blank" anchor.
  // After BUG-3's fix exactly ONE popup fires (the sealed one). The
  // `When` step's listener has been collecting popup URLs since the
  // detail page loaded; we just sample the bucket here.
  const popups = popupBuckets.get(page) ?? [];
  expect(popups.length, `expected 1 popup, got ${popups.length}: ${popups.join(', ')}`).toBe(1);
  // The popup's URL may briefly read as about:blank before the anchor's
  // target navigation lands; just confirm it isn't the audit URL.
  expect(popups[0]).not.toMatch(/audit\.pdf$/);
});

Then('the audit trail is delivered as a download \\(no popup)', async ({ page }) => {
  // The fixed bundle path uses `<a download>` for the audit, which
  // never opens a window. The popup bucket therefore must contain
  // exactly the single sealed-tab URL — no second window-open.
  const popups = popupBuckets.get(page) ?? [];
  expect(popups.length, `audit trail must NOT spawn a popup; bucket: ${popups.join(', ')}`).toBe(1);
});

Then('the success toast confirms the download', async ({ page }) => {
  await expect(page.getByText(/audit trail downloaded/i)).toBeVisible();
});
