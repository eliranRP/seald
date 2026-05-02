import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender on the contacts page with the API ready to accept {string} {string}',
  async ({ seededUser, mockedApi, contactsPage }, name: string, email: string) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
    mockedApi.on('POST', /\/api\/contacts$/, {
      json: {
        id: `c_${name.toLowerCase()}`,
        owner_id: '00000000-0000-4000-8000-000000000a11',
        name,
        email,
        color: '#3b82f6',
        created_at: '2026-05-02T10:00:00Z',
        updated_at: '2026-05-02T10:00:00Z',
      },
    });
    await contactsPage.goto();
  },
);

/**
 * BDD step defs for `features/contacts-keyboard.feature`. Covers Bug B
 * (Enter inside the add-signer dialog must submit) and Bug C (a single
 * `error` slot was painting name-validation errors under the email
 * field). Steps query by accessible role/name only (rule 4.6).
 *
 * The shared `Given a signed-in sender on the contacts page` lives in
 * `sender-contacts.steps.ts` — playwright-bdd auto-discovers every
 * `*.steps.ts` so we don't need to (and must not) re-declare it here.
 * The shared Given already mocks GET /api/contacts → [] and POST
 * /api/contacts → a fixture row whose name happens to be "Dana"; the
 * existing scenario also adds a "Dana"/"dana@example.com" pair, so the
 * mocked POST response is shape-compatible with any add-signer flow
 * regardless of the typed payload (the SPA renders what came back).
 */

When('the sender opens the add-signer dialog', async ({ page }) => {
  await page
    .getByRole('button', { name: /^add signer$/i })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: /add signer/i })).toBeVisible();
});

When('the sender types {string} into the name field', async ({ page }, value: string) => {
  const dialog = page.getByRole('dialog', { name: /add signer/i });
  await dialog.getByRole('textbox', { name: /^name$/i }).fill(value);
});

When('the sender types {string} into the email field', async ({ page }, value: string) => {
  const dialog = page.getByRole('dialog', { name: /add signer/i });
  await dialog.getByRole('textbox', { name: /^email$/i }).fill(value);
});

When('the sender presses Enter', async ({ page }) => {
  // Focus is already inside the email field (fill leaves the caret there);
  // the page wires Enter-to-submit on each input via onKeyDown.
  await page.keyboard.press('Enter');
});

When('the sender submits the dialog', async ({ page }) => {
  await page
    .getByRole('dialog', { name: /add signer/i })
    .getByRole('button', { name: /^add signer$/i })
    .click();
});

Then('the add-signer dialog closes', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: /add signer/i })).toHaveCount(0);
});

// Note: `Then '{string} appears in the contacts list'` already lives in
// `sender-contacts.steps.ts`; playwright-bdd auto-discovers all step
// files so re-declaring it here would throw a duplicate-step error.

Then('the name field shows the {string} error', async ({ page }, message: string) => {
  const dialog = page.getByRole('dialog', { name: /add signer/i });
  const nameInput = dialog.getByRole('textbox', { name: /^name$/i });
  // The TextField wires `aria-describedby` → `<input>-err` only when
  // `error` is set, so resolving the id back to its element gives us
  // both "the name field is the one being flagged" and "the error
  // text matches what the user sees".
  const describedBy = await nameInput.getAttribute('aria-describedby');
  expect(describedBy, 'name field has no aria-describedby — error not attached').toBeTruthy();
  if (!describedBy) return;
  const errorEl = page.locator(`#${describedBy}`);
  await expect(errorEl).toHaveText(new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

Then('the email field has no error', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: /add signer/i });
  const emailInput = dialog.getByRole('textbox', { name: /^email$/i });
  await expect(emailInput).not.toHaveAttribute('aria-invalid', 'true');
});
