import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Steps for `sender-mobile-nav.feature`. Reuses the seeded-user
 * Background step from sender-mobile.steps.ts and exercises the
 * MWMobileNav (hamburger → bottom-sheet). The "From a template" tile
 * step + `Then the URL is /templates` step were retired 2026-05-03 when
 * the templates list became unreachable from a mobile viewport (every
 * AppShell route now redirects to /m/send).
 */

Given('the sender visits \\/m\\/send', async ({ page }) => {
  await page.goto('/m/send');
  // Wait for the start-step heading so subsequent taps don't race
  // against initial render.
  await expect(page.getByRole('heading', { name: /new document/i })).toBeVisible();
});

When('the sender opens the mobile menu', async ({ page }) => {
  await page.getByRole('button', { name: /open menu/i }).click();
  // Sheet is a role=dialog; wait for it before issuing further taps.
  await expect(page.getByRole('dialog')).toBeVisible();
});

When('the sender taps the menu item {string}', async ({ page }, label: string) => {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(`^${label}$`, 'i') })
    .click();
});

// `When the sender taps the "<name>" tile` was retired 2026-05-03 with
// the deletion of the "From a template" tile (templates list is
// desktop-only; mobile users redirect to /m/send if they reach
// /templates). The two remaining tiles ("Upload PDF" / "Take photo")
// have their own dedicated steps in mobile-photo-capture.steps.ts.

Then('the mobile menu shows the user name {string}', async ({ page }, name: string) => {
  await expect(page.getByRole('dialog')).toContainText(name);
});

Then('the mobile menu has a {string} button', async ({ page }, label: string) => {
  await expect(
    page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
  ).toBeVisible();
});

Then('the mobile menu has a {string} nav button', async ({ page }, label: string) => {
  await expect(
    page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
  ).toBeVisible();
});

Then('the URL is \\/signin', async ({ page }) => {
  await page.waitForURL(/\/signin$/);
  expect(page.url()).toMatch(/\/signin$/);
});

// `Then the URL is /templates` retired 2026-05-03 (see header comment).
