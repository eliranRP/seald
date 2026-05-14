import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

/**
 * PR-4 audit (item 5) moved the destructive decline / wrong-recipient
 * / withdraw-consent links into a collapsed <details> summary
 * ("Need to opt out?") below the AES disclosure, so the screen leads
 * with the legal disclosure instead of demoting it next to a
 * red-button gauntlet. The recipient still has to do TWO things to
 * hit the destructive action: open the disclosure THEN tap the
 * specific opt-out — which is the whole point of moving them in
 * there. The "Not me?" CTA was also renamed to "Wrong recipient?"
 * because that's what the audit log calls it (`not-the-recipient`).
 */
async function openOptOutAndClickWrongRecipient(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /need to opt out/i }).click();
  await page.getByRole('button', { name: /wrong recipient\?/i }).click();
}

When('the recipient taps "Not me?" but cancels the confirmation', async ({ page }) => {
  // Native confirm — Playwright's dialog handler can dismiss before the
  // click commits. dismiss() simulates the user clicking Cancel.
  page.once('dialog', (d) => {
    void d.dismiss();
  });
  await openOptOutAndClickWrongRecipient(page);
});

When('the recipient taps "Not me?" and confirms the dialog', async ({ page }) => {
  page.once('dialog', (d) => {
    void d.accept();
  });
  await openOptOutAndClickWrongRecipient(page);
});

Then('the recipient stays on the prep page', async ({ page }) => {
  // URL must still match `/sign/<id>/prep` and the Start signing CTA
  // must still be visible — no navigation occurred.
  await expect(page).toHaveURL(/\/sign\/[^/]+\/prep/);
  await expect(page.getByRole('button', { name: /start signing/i })).toBeVisible();
});
