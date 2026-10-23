import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * BDD step defs for `mobile-sign-recipient.feature`.
 *
 * Why we don't mint a real signer token here:
 *   The e2e harness has no live API server — every `/sign/*` call is
 *   intercepted at `page.route()` by the `signedEnvelope` fixture
 *   (apps/web/e2e/fixtures/signedEnvelope.ts). The fixture's wire
 *   shape mirrors `apps/api/src/signing/signing.controller.spec.ts`.
 *   Stubbing keeps the meaningful surface (URL transitions, font-
 *   family, layout) under test without that machinery.
 *
 * Reuses these phrases from signer-mobile.steps.ts / signer-happy:
 *   - `Given a sealed envelope ready for signing`
 *   - `When the recipient opens the signing link and lands on the document`
 *   - `When the recipient agrees and starts`
 *   - `When the recipient opens the signature sheet`
 */

Given('the viewport is set to a 390x844 phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

Then('the consent bar Start button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();
});

When('the recipient types {string} into the signature field', async ({ page }, name: string) => {
  // The signing-fill page uses SignatureCapture. Its typed-tab textbox
  // carries `aria-label="Your full name"`.
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /your full name/i })
    .fill(name);
});

Then('the typed-signature preview uses the Caveat font', async ({ page }) => {
  // The sheet's pad renders the typed name in the script face
  // (`theme.font.script` → "'Caveat', …"). Asserting the computed
  // font-family proves (a) the stylesheet wired the script font, and
  // (b) the @font-face declaration was allowed by the CSP from PR #111.
  const dialog = page.getByRole('dialog');
  const previewText = dialog.getByText('Bob Recipient', { exact: true }).first();
  await expect(previewText).toBeVisible();
  const fontFamily = await previewText.evaluate(
    (el: Element) => getComputedStyle(el as HTMLElement).fontFamily,
  );
  expect(fontFamily).toMatch(/Caveat/i);
});

Then('the header More menu is visible inside the viewport', async ({ page }) => {
  // Decline lives in the More menu, so it has to stay reachable on a
  // 390-wide viewport. `toBeInViewport` is the strictest version of "the
  // user can actually tap this".
  const more = page.getByRole('button', { name: 'More', exact: true });
  await expect(more).toBeVisible();
  await expect(more).toBeInViewport();
});

Then('the page fits the viewport width', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
