import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

/**
 * "Not me?" lives in the header's More menu and asks first, in a styled
 * confirmation: one tap by accident never declines the envelope.
 */
When(
  'the recipient taps "Not me?" but cancels the confirmation',
  async ({ page, signingFillPage }) => {
    await signingFillPage.openNotMe();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^cancel$/i })
      .click();
  },
);

When('the recipient taps "Not me?" and confirms the dialog', async ({ page, signingFillPage }) => {
  await signingFillPage.openNotMe();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /this isn't me/i })
    .click();
});

Then('the recipient stays on the document', async ({ page }) => {
  // URL must still match `/sign/<id>/fill` and the consent bar must still
  // be there — no navigation occurred.
  await expect(page).toHaveURL(/\/sign\/[^/]+\/fill/);
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
});
