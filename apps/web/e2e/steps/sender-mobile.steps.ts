import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Steps for `sender-mobile.feature`. The viewport is a 375x667
 * iPhone-SE-equivalent, inside the `(max-width: 640px)` mobile layouts. The
 * old `/m/send` wizard is gone: the app root and the retired link both land on
 * the responsive `/documents` page.
 */
Given('a signed-in sender on a 375x667 phone', async ({ seededUser, mockedApi, page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await seededUser.signInAs();
  mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: [] });
  mockedApi.on('GET', /\/api\/templates(\?|$)/, { json: [] });
});

When('the sender visits the root', async ({ page }) => {
  await page.goto('/');
});

When('the sender opens the old mobile send link', async ({ page }) => {
  await page.goto('/m/send');
});

Then('the URL is \\/documents', async ({ page }) => {
  // The dashboard may add its own query (e.g. ?status=all).
  await page.waitForURL(/\/documents(\?.*)?$/);
  expect(page.url()).toMatch(/\/documents(\?.*)?$/);
});
