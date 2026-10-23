import { test, expect } from '@playwright/test';

/**
 * The signing-done page is a single centred column. It must never scroll
 * sideways, and its two actions (Download, Save a copy) stay reachable on
 * a phone.
 */

const ENVELOPE_ID = 'env-layout-001';
const SHORT_CODE = 'LAYOUTDONE001';

const SNAPSHOT = {
  kind: 'submitted',
  envelope_id: ENVELOPE_ID,
  short_code: SHORT_CODE,
  title: 'Master Services Agreement',
  sender_name: 'Eliran Azulay',
  recipient_email: 'maya@example.com',
  timestamp: '2026-04-24T00:00:00.000Z',
};

const VERIFY = {
  envelope: {
    id: ENVELOPE_ID,
    title: SNAPSHOT.title,
    short_code: SHORT_CODE,
    status: 'completed',
    original_pages: 2,
    original_sha256: null,
    sealed_sha256: null,
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-24T00:00:00.000Z',
    completed_at: '2026-04-24T00:00:08.000Z',
    expires_at: '2026-05-24T00:00:00.000Z',
  },
  signers: [],
  events: [],
  chain_intact: true,
  sealed_url: 'https://signed.example/sealed.pdf?sig=layout',
  audit_url: 'https://signed.example/audit.pdf?sig=layout',
};

test.describe('signing-done layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ snapshot }) => {
        Object.assign(window, { __SEALD_CONSENT_DISABLED: true });
        window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(snapshot));
      },
      { snapshot: { ...SNAPSHOT, signed_count: 3, total_count: 3 } },
    );
    await page.route('**/api/verify/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(VERIFY),
      }),
    );
  });

  for (const width of [320, 390, 1440]) {
    test(`the page fits at ${width}px and both actions are in view`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`/sign/${ENVELOPE_ID}/done`);

      await expect(page.getByRole('heading', { name: /^signed$/i })).toBeVisible();
      const download = page.getByRole('link', { name: /^download$/i });
      const save = page.getByRole('link', { name: /save a copy to a free seald account/i });
      await expect(download).toBeVisible();
      await expect(save).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const box = await save.boundingBox();
      if (!box) throw new Error('save link has no box');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    });
  }
});
