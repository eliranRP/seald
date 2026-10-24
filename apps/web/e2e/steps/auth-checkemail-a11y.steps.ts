import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

/**
 * BDD steps for the check-email live-region announcement (Bug C regression,
 * see `apps/web/src/components/CheckEmailPanel/CheckEmailPanel.test.tsx` for
 * the unit-level coverage of the role / label).
 */

When(
  'the user lands on the check-your-email screen for {string}',
  async ({ page }, email: string) => {
    await page.goto(`/check-email?email=${encodeURIComponent(email)}`);
  },
);

Then(
  'a polite live region announces the sign-in link was sent to {string}',
  async ({ page }, email: string) => {
    const status = page.getByRole('status', { name: /sign-in link sent/i });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toContainText(email);
  },
);
