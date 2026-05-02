import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, Then } = createBdd(test);

/**
 * BDD step defs for `mobile-hamburger.feature`.
 *
 * Pins the post-PR-#111 mobile-hamburger contract: only Documents +
 * Sign out are exposed; Sign / Templates / Signers / Download my data
 * / Delete account are intentionally hidden. Reuses the same seeded-
 * user + mocked-api scaffolding the existing sender-mobile.steps.ts
 * uses, but with a 390x844 viewport (iPhone 14) per the user-supplied
 * brief — still well inside the ≤640px mobile gate.
 *
 * `When the sender opens the mobile menu` and `When the sender taps the
 * menu item {string}` are intentionally NOT redefined here — they
 * already exist in sender-mobile-nav.steps.ts. playwright-bdd resolves
 * step phrases globally, so duplicates would throw at compile time.
 * Same for `Then the URL is /signin` (sender-mobile-nav.steps.ts).
 */

Given('a signed-in sender on a 390x844 phone', async ({ seededUser, mockedApi, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seededUser.signInAs();
  // Stub the SPA's bootstrap calls so the mobile sender flow can mount
  // without 404s from the missing-mock fallback. We don't exercise the
  // full send pipeline here — only the hamburger sheet — so the minimal
  // shape is enough.
  mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: [] });
  mockedApi.on('GET', /\/api\/templates(\?|$)/, { json: [] });
});

Then('the mobile menu shows the user email {string}', async ({ page }, email: string) => {
  await expect(page.getByRole('dialog')).toContainText(email);
});

Then('the mobile menu does not contain a {string} button', async ({ page }, label: string) => {
  await expect(
    page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
  ).toHaveCount(0);
});

Then('the URL is \\/documents', async ({ page }) => {
  await page.waitForURL(/\/documents$/);
  expect(page.url()).toMatch(/\/documents$/);
});

Then('the mobile menu sheet is closed', async ({ page }) => {
  // The MWBottomSheet unmounts (or hides) on close — `role=dialog`
  // count goes to 0 once the sheet is dismissed.
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
