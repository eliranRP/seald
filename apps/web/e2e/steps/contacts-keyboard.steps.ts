import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

const OWNER = '00000000-0000-4000-8000-000000000a11';

/**
 * BDD step defs for `features/contacts-keyboard.feature`. Steps query by
 * accessible role/name only (rule 4.6). The add-contacts steps shared with
 * `sender-contacts.feature` ("opens the add contacts dialog", "the
 * confirmation ... is shown") live in `sender-contacts.steps.ts`;
 * playwright-bdd discovers every `*.steps.ts`, so they must not be
 * re-declared here.
 */

Given(
  'a signed-in sender on the contacts page with a contact {string} {string}',
  async ({ seededUser, mockedApi, contactsPage }, name: string, email: string) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, {
      json: [
        {
          id: 'c_carla',
          owner_id: OWNER,
          name,
          email,
          color: '#3b82f6',
          created_at: '2026-05-02T10:00:00Z',
          updated_at: '2026-05-02T10:00:00Z',
          docs_count: 0,
          last_sent_at: null,
        },
      ],
    });
    mockedApi.on('POST', /\/api\/contacts\/bulk$/, {
      json: {
        created: [
          {
            id: 'c_nora',
            owner_id: OWNER,
            name: 'Nora',
            email: 'nora@example.com',
            color: '#3b82f6',
            created_at: '2026-05-02T10:00:00Z',
            updated_at: '2026-05-02T10:00:00Z',
          },
        ],
        skipped_duplicate: [],
        invalid: [],
      },
    });
    await contactsPage.goto();
    await contactsPage.expectContactVisible(name);
  },
);

When('the sender types {string} into the emails field', async ({ contactsPage }, value: string) => {
  await contactsPage.addDialog.getByRole('textbox', { name: 'Emails' }).fill(value);
});

When('the sender presses Enter', async ({ page }) => {
  await page.keyboard.press('Enter');
});

Then('{string} shows as a new email chip', async ({ contactsPage }, email: string) => {
  await expect(
    contactsPage.addDialog.getByRole('button', { name: `Remove ${email}` }),
  ).toBeVisible();
});

When('the sender tabs to the add button and presses Enter', async ({ page }) => {
  // From the text field: Cancel, then Add 1.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Add 1', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
});

Then('the add contacts dialog closes', async ({ contactsPage }) => {
  await expect(contactsPage.addDialog).toHaveCount(0);
});

When('the sender opens the edit dialog for {string}', async ({ contactsPage }, name: string) => {
  await contactsPage.openRowMenu(name);
  await contactsPage.page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(contactsPage.editDialog).toBeVisible();
});

When('the sender clears the name field', async ({ contactsPage }) => {
  await contactsPage.editDialog.getByRole('textbox', { name: 'Name' }).fill('');
});

When('the sender saves the contact', async ({ contactsPage }) => {
  await contactsPage.editDialog.getByRole('button', { name: 'Save' }).click();
});

Then('the name field shows the {string} error', async ({ contactsPage }, message: string) => {
  const nameInput = contactsPage.editDialog.getByRole('textbox', { name: 'Name' });
  // TextField links the error to its input through `aria-describedby`, so
  // resolving the id back to its element proves the error belongs to the
  // name field and that the text matches what the sender sees.
  const describedBy = await nameInput.getAttribute('aria-describedby');
  expect(describedBy, 'name field has no aria-describedby: error not attached').toBeTruthy();
  if (!describedBy) return;
  await expect(contactsPage.page.locator(`[id="${describedBy}"]`)).toHaveText(message);
});

Then('the email field has no error', async ({ contactsPage }) => {
  const emailInput = contactsPage.editDialog.getByRole('textbox', { name: 'Email' });
  await expect(emailInput).not.toHaveAttribute('aria-invalid', 'true');
});
