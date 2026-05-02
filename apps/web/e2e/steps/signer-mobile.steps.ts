import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

// Reuses `Given a sealed envelope ready for signing` from
// signer-happy.steps.ts.
const { Given, When, Then } = createBdd(test);

/**
 * Phone-sized viewport so layout & sticky-CTA assertions reflect the
 * iOS Safari case the bug-fix targets. 375x667 = iPhone SE (smallest
 * mainstream viewport we support).
 */
Given('the viewport is set to a 375x667 phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
});

When(
  'the recipient opens the signing link and lands on the prep page',
  async ({ signingEntryPage, signedEnvelope }) => {
    await signingEntryPage.goto(signedEnvelope.id);
    await signingEntryPage.startSigning();
  },
);

When('the recipient agrees and continues to fill', async ({ signingPrepPage, page }) => {
  await signingPrepPage.agreeAndContinue();
  await page.waitForURL(/\/sign\/[^/]+\/fill/);
});

When('the recipient opens the signature sheet', async ({ page }) => {
  await page
    .getByRole('button', { name: /sign here/i })
    .first()
    .click();
});

Then('the sheet "Apply" button is visible inside the viewport', async ({ page }) => {
  // The Apply button must be inside the visual viewport. Without the dvh
  // / safe-area fix the button sat below the viewport on a phone-sized
  // window and `toBeInViewport` fails.
  const apply = page.getByRole('button', { name: /^apply$/i });
  await expect(apply).toBeVisible();
  await expect(apply).toBeInViewport();
});
