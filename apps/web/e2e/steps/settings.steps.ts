import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/** Steps for `features/settings.feature`. `/api/*` is mocked at the network layer. */

Given('the sender is signed in with saved settings', async ({ seededUser, mockedApi }) => {
  await seededUser.signInAs({
    id: '00000000-0000-4000-8000-000000000a11',
    email: 'alice@example.com',
    fullName: 'Alice Example',
  });
  mockedApi.on('GET', /\/api\/me\/settings(\?|$)/, {
    json: {
      display_name: 'Alice Example',
      signature: { type: 'typed', typed_text: 'Alice Example', image: null },
      initials: 'AE',
      notify: { signed: true, daily_summary: false },
      reminder_default: '3d',
      expiry_default_days: 30,
    },
  });
  mockedApi.on('GET', /\/api\/integrations\/gdrive\/accounts(\?|$)/, { json: [] });
});

When('the sender opens {string}', async ({ page }, path: string) => {
  await page.goto(path);
});

Then('the page is at {string}', async ({ page }, path: string) => {
  await expect(page).toHaveURL(new RegExp(`${path}$`));
});

Then('the settings navigation lists {string}', async ({ page }, names: string) => {
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  for (const name of names.split(',').map((n) => n.trim())) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
});

Then('the {string} field shows {string}', async ({ page }, label: string, value: string) => {
  await expect(page.getByLabel(label)).toHaveValue(value);
});

Then('the {string} switch is on and cannot be changed', async ({ page }, name: string) => {
  const sw = page.getByRole('switch', { name });
  await expect(sw).toBeChecked();
  await expect(sw).toBeDisabled();
});

Then('there is no {string} switch', async ({ page }, name: string) => {
  await expect(page.getByRole('switch', { name })).toHaveCount(0);
});

When('the sender chooses Delete', async ({ page }) => {
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
});

Then('the {string} button is disabled', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
});

Then('the {string} button is enabled', async ({ page }, name: string) => {
  await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
});

When('the sender types {string} to confirm', async ({ page }, text: string) => {
  await page.getByRole('textbox', { name: 'Type DELETE to confirm' }).fill(text);
});
