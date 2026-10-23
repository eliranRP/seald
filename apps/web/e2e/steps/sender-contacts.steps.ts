import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

const OWNER = '00000000-0000-4000-8000-000000000a11';

function contactRow(name: string, email: string) {
  return {
    id: `c_${name.toLowerCase().replace(/\W+/g, '_')}`,
    owner_id: OWNER,
    name,
    email,
    color: '#3b82f6',
    created_at: '2026-04-25T10:00:00Z',
    updated_at: '2026-04-25T10:00:00Z',
    docs_count: 0,
    last_sent_at: null,
  };
}

Given(
  'a signed-in sender on the contacts page',
  async ({ seededUser, mockedApi, contactsPage }) => {
    await seededUser.signInAs();
    // listContacts returns ReadonlyArray<ApiContact> directly (no envelope).
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
    mockedApi.on('POST', /\/api\/contacts\/bulk$/, {
      json: {
        created: [contactRow('Dana', 'dana@example.com'), contactRow('Sam', 'sam@example.com')],
        skipped_duplicate: ['dana@example.com'],
        invalid: ['nope@@x'],
      },
    });
    await contactsPage.goto();
  },
);

Given(
  'the sender already has the contact {string} {string}',
  async ({ mockedApi, contactsPage, page }, name: string, email: string) => {
    mockedApi.override('GET', /\/api\/contacts(\?|$)/, { json: [contactRow(name, email)] });
    await page.reload();
    await contactsPage.expectVisible();
  },
);

When('the sender opens the add contacts dialog', async ({ contactsPage }) => {
  await contactsPage.openAddDialog();
});

When('the sender pastes {string} into the emails field', async ({ contactsPage }, text: string) => {
  await contactsPage.pasteEmails(text);
});

Then('the add contacts summary reads {string}', async ({ contactsPage }, text: string) => {
  await expect(contactsPage.addDialog.getByText(text)).toBeVisible();
});

Then('the add button reads {string}', async ({ contactsPage }, label: string) => {
  await expect(
    contactsPage.addDialog.getByRole('button', { name: label, exact: true }),
  ).toBeEnabled();
});

When('the sender confirms adding the contacts', async ({ contactsPage }) => {
  await contactsPage.addDialog.getByRole('button', { name: /^add \d+$/i }).click();
});

Then('the confirmation {string} is shown', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('{string} appears in the contacts list', async ({ contactsPage }, name: string) => {
  await contactsPage.expectContactVisible(name);
});
