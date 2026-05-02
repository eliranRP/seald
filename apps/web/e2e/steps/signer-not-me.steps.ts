import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

When('the recipient taps "Not me?" but cancels the confirmation', async ({ page }) => {
  // Native confirm — Playwright's dialog handler can dismiss before the
  // click commits. dismiss() simulates the user clicking Cancel.
  page.once('dialog', (d) => {
    void d.dismiss();
  });
  await page.getByRole('button', { name: /not me\?/i }).click();
});

When('the recipient taps "Not me?" and confirms the dialog', async ({ page }) => {
  page.once('dialog', (d) => {
    void d.accept();
  });
  await page.getByRole('button', { name: /not me\?/i }).click();
});

Then('the recipient stays on the prep page', async ({ page }) => {
  // URL must still match `/sign/<id>/prep` and the Start signing CTA
  // must still be visible — no navigation occurred.
  await expect(page).toHaveURL(/\/sign\/[^/]+\/prep/);
  await expect(page.getByRole('button', { name: /start signing/i })).toBeVisible();
});
