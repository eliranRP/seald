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
    // Both download URL kinds; the SPA appends `kind` as a query param.
    mockedApi.on('GET', new RegExp(`/api/envelopes/${RECENT_ID}/download`), {
      json: { url: 'https://signed.example/sealed-or-audit.pdf', kind: 'sealed' },
    });
  },
);

Given('the viewport is sized to an iPhone \\(375x812)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

When('the sender opens the dashboard', async ({ dashboardPage }) => {
  await dashboardPage.goto();
});

When('the sender opens the recent envelope detail', async ({ page }) => {
  // EnvelopeDetailPage is mounted under `/document/:id` via DocumentRoute
  // — the route falls through to the detail page once the envelope is in
  // a sent / completed state (no local draft for it).
  await page.goto(`/document/${RECENT_ID}`);
});

When('the sender chooses the {string} download bundle', async ({ page }, _label: string) => {
  // Open the split-button dropdown via its aria-label, then pick the
  // bundle row by its accessible role + visible name. The visible
  // title is "Full package" — matching loosely here so a copy tweak
  // doesn't make the BDD brittle.
  await page.getByRole('button', { name: /show all download options/i }).click();
  await page.getByRole('menuitem', { name: /full package/i }).click();
});

Then('the envelope row tiles do not overflow the viewport', async ({ page }) => {
  // Pick any envelope row by its title and assert its bounding box
  // sits inside the 375px viewport. Without BUG-1's fix the row's
  // intrinsic min-width (1.3fr+1.5fr+1fr+180+100+60 = ~620px content +
  // 96px padding) would push it well past the right edge.
  const row = page.getByRole('button', { name: /Recent NDA/i });
  await row.waitFor();
  const box = await row.boundingBox();
  expect(box, 'row must have a bounding box').not.toBeNull();
  if (!box) throw new Error('unreachable');
  expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
});

Then('the column-header strip is hidden', async ({ page }) => {
  // BUG-1 fix hides the TableHead at <=768px. The "Document" / "Status"
  // headings (uppercase 11px labels) should not be visible on mobile.
  // We assert by accessible text — they're not in any heading role, so
  // we use a regex on the body text in the dashboard region.
  const documentHeading = page.locator('text=/^DOCUMENT$/i').first();
  await expect(documentHeading).toBeHidden();
});

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
  // The bundle path opens the sealed URL via target="_blank" anchor. We
  // wait for a `popup` event to fire exactly once. (BUG-3 had two
  // popups — the second was silently blocked.)
  const popupPromise = page.waitForEvent('popup', { timeout: 5_000 });
  // No-op — the popup was triggered when the `When` step clicked the
  // menu item. We're just collecting the event here.
  const popup = await popupPromise;
  expect(popup.url()).toMatch(/sealed-or-audit\.pdf$/);
});

Then('the audit trail is delivered as a download \\(no popup)', async ({ page }) => {
  // The fixed bundle path uses `<a download>` for the audit, which
  // never opens a window. We assert no SECOND popup fires within a
  // short window — so the only popup we got is the sealed one.
  let secondPopup = false;
  page.once('popup', () => {
    secondPopup = true;
  });
  await page.waitForTimeout(500);
  expect(secondPopup).toBe(false);
});

Then('the success toast confirms the download', async ({ page }) => {
  await expect(page.getByText(/audit trail downloaded/i)).toBeVisible();
});
