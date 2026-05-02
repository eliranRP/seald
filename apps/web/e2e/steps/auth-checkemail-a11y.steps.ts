import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

/**
 * BDD steps for the CheckEmailPage live-region announcement (Bug C
 * regression — see `apps/web/src/pages/CheckEmailPage/CheckEmailPage.test.tsx`
 * for the unit-level coverage of the role/label).
 *
 * The "Given the password-reset API will succeed" + "When the user
 * requests a reset for {email}" steps are reused from auth-forgot.steps.ts.
 */

When('the user lands on the signup confirmation for {string}', async ({ page }, email: string) => {
  await page.goto(`/check-email?email=${encodeURIComponent(email)}&mode=signup`);
});

Then(
  'a polite live region announces the reset link was sent to {string}',
  async ({ page }, email: string) => {
    const status = page.getByRole('status', { name: /password reset link sent/i });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toContainText(email);
  },
);

Then('a polite live region announces the confirmation link was sent', async ({ page }) => {
  const status = page.getByRole('status', { name: /confirmation link sent/i });
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute('aria-live', 'polite');
});
