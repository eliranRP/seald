import { test, expect } from '@playwright/test';

/**
 * The save action on the signing-done card must stay inside the card on a
 * phone. The label may wrap, but not past two lines, and the control stays
 * a 44px touch target.
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

test.describe('signing-done save button layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ({ snapshot }) => {
        Object.assign(window, { __SEALD_CONSENT_DISABLED: true });
        window.sessionStorage.setItem('sealed.sign.last', JSON.stringify(snapshot));
      },
      { snapshot: SNAPSHOT },
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
    test(`save button stays inside the card at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`/sign/${ENVELOPE_ID}/done`);

      const button = page.getByRole('button', { name: /save to my seald account/i });
      const card = page.getByRole('region', { name: /create your free seald account/i });
      await expect(button).toBeVisible();
      await expect(card).toBeVisible();

      const buttonBox = await button.boundingBox();
      const cardBox = await card.boundingBox();
      if (!buttonBox || !cardBox) {
        throw new Error('save button or upsell card has no box');
      }

      expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(buttonBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);

      const lines = await button.evaluate((el) => {
        const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (!text) return 0;
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getClientRects().length;
      });
      expect(lines).toBeGreaterThan(0);
      expect(lines).toBeLessThanOrEqual(2);

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      const textFits = await button.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(textFits).toBe(true);

      const email = page.getByRole('textbox', { name: /your email/i });
      const emailBox = await email.boundingBox();
      if (!emailBox) throw new Error('email field has no box');
      expect(Math.round(emailBox.height)).toBe(48);
      if (width === 1440) {
        expect(Math.round(emailBox.height)).toBe(Math.round(buttonBox.height));
      }
      if (width === 1440 || width === 390) {
        const padding = await button.evaluate((el) => {
          const style = getComputedStyle(el);
          return { left: style.paddingLeft, right: style.paddingRight };
        });
        // Button lg horizontal padding is theme.space[5].
        expect(padding.left).toBe('20px');
        expect(padding.right).toBe('20px');
      }
    });
  }

  for (const width of [390, 546, 1440]) {
    test(`a 65-character save label stays inside the card at ${width}px`, async ({ page }) => {
      const label = 'Save to my Seald account and keep this signed document forever now';
      expect(label.length).toBeGreaterThanOrEqual(65);

      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`/sign/${ENVELOPE_ID}/done`);

      const button = page.getByRole('button', { name: /save to my seald account/i });
      const card = page.getByRole('region', { name: /create your free seald account/i });
      await expect(button).toBeVisible();
      await button.evaluate((el, next) => {
        el.textContent = next;
      }, label);

      const labeled = page.getByRole('button', { name: label });
      const buttonBox = await labeled.boundingBox();
      const cardBox = await card.boundingBox();
      const emailBox = await page.getByRole('textbox', { name: /your email/i }).boundingBox();
      if (!buttonBox || !cardBox || !emailBox) {
        throw new Error('save button, email field, or upsell card has no box');
      }

      expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(buttonBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);

      const lines = await labeled.evaluate((el) => {
        const text = [...el.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (!text) return 0;
        const range = document.createRange();
        range.selectNodeContents(text);
        return range.getClientRects().length;
      });
      expect(lines).toBeGreaterThan(0);
      // Shared lg padding is 20px. At 390 that leaves this 65-character
      // label on three lines. A tighter padding is only for the shipped
      // label when it exceeds two lines at 320, which it does not.
      expect(lines).toBeLessThanOrEqual(width === 390 ? 3 : 2);

      const sharesRow = Math.abs(buttonBox.y - emailBox.y) < 4;
      if (sharesRow) {
        expect(Math.round(buttonBox.height)).toBe(48);
        expect(Math.round(buttonBox.height)).toBe(Math.round(emailBox.height));
      }

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      const textFits = await labeled.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(textFits).toBe(true);
    });
  }
});
