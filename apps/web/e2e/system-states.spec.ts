import { test, expect } from '@playwright/test';

/**
 * System states (redesign K): a real 404 for unknown URLs and the offline bar.
 * API traffic is mocked at the network layer.
 */

test.describe('system states', () => {
  test.beforeEach(async ({ page }) => {
    // Nothing here needs the API; a refused health check must not matter.
    await page.route('**/health', (route) =>
      route.fulfill({ status: 200, json: { status: 'ok' } }),
    );
  });

  test('an unknown URL shows the 404 instead of redirecting', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveURL(/\/this-page-does-not-exist$/);
    await expect(page.getByRole('link', { name: 'Go to the Seald home page' })).toBeVisible();
  });

  test('the offline bar appears and then reports back online', async ({ page, context }) => {
    await page.goto('/this-page-does-not-exist');
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeHidden({
      timeout: 6000,
    });
  });
});
