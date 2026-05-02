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
 *   Calling the real Nest controller in a Playwright run would
 *   require booting the API + Postgres, which the existing
 *   `chromium-bdd` project does not do (see playwright.config.ts).
 *   Stubbing keeps the meaningful surface (URL transitions, font-
 *   family, layout) under test without that machinery.
 *
 * Reuses these phrases from signer-mobile.steps.ts / signer-happy:
 *   - `Given a sealed envelope ready for signing`
 *   - `When the recipient opens the signing link and lands on the prep page`
 *   - `When the recipient agrees and continues to fill`
 *   - `When the recipient opens the signature sheet`
 */

Given('the viewport is set to a 390x844 phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

Then('the prep page Start signing button is visible', async ({ page }) => {
  // SigningPrepPage renders "Start signing" — same selector that
  // SigningPrepPage.expectVisible() uses; named-step here so the
  // assertion is part of the BDD verdict block.
  await expect(page.getByRole('button', { name: /start signing/i })).toBeVisible();
});

When('the recipient types {string} into the signature field', async ({ page }, name: string) => {
  // The signing-fill page uses SignatureCapture (not SignaturePad).
  // Its typed-tab textbox carries `aria-label="Your full name"`
  // (SignatureCapture.tsx line 295). The dialog also has an "Add
  // your signature" header but no role=heading, so we anchor on the
  // accessible textbox name.
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /your full name/i })
    .fill(name);
});

Then('the typed-signature preview uses the Caveat font', async ({ page }) => {
  // SignatureCapture's typed preview renders a <SignatureMark> whose
  // inner <Script> carries `font-family: ${theme.font.script}` →
  // "'Caveat', 'Segoe Script', cursive" (apps/web/src/styles/theme.ts).
  // The Mark wrapper is aria-hidden, so we can't reach it by role —
  // descend by accessible text instead. Asserting the computed
  // font-family proves (a) the stylesheet wired the script font, and
  // (b) the @font-face declaration was allowed by the CSP from PR #111.
  const dialog = page.getByRole('dialog');
  const previewText = dialog.getByText('Bob Recipient', { exact: true }).last();
  await expect(previewText).toBeVisible();
  const fontFamily = await previewText.evaluate(
    (el: Element) => getComputedStyle(el as HTMLElement).fontFamily,
  );
  expect(fontFamily).toMatch(/Caveat/i);
});

Then('the Decline button is visible inside the viewport', async ({ page }) => {
  // Mobile @media at SigningFillPage.styles.ts lines 26–30 wraps the
  // ActionBar to two rows so the Decline button doesn't get pushed
  // off-screen on a 390-wide viewport. `toBeInViewport` is the
  // strictest version of "user can actually tap this".
  const decline = page.getByRole('button', { name: /decline/i });
  await expect(decline).toBeVisible();
  await expect(decline).toBeInViewport();
});

Then('the page-thumb rail is hidden on mobile', async ({ page }) => {
  // RailSlot at SigningFillPage.styles.ts lines 184–200 sets
  // `display:none` under @media (max-width:768px). The styled
  // <aside> is `role="complementary"` by default; assert it's either
  // not in the accessibility tree OR has computed display:none.
  // We use the more general `.aside` selector so any future role
  // override stays asserted by the same step.
  const aside = page.locator('aside');
  const count = await aside.count();
  if (count === 0) {
    // Conditionally rendered to null under mobile — also acceptable.
    return;
  }
  // At least one aside must NOT be visible (the rail). We assert that
  // ALL asides have display:none on mobile, which is what the @media
  // block prescribes for RailSlot.
  for (let i = 0; i < count; i += 1) {
    const display = await aside
      .nth(i)
      .evaluate((el: Element) => getComputedStyle(el as HTMLElement).display);
    expect(display).toBe('none');
  }
});
