import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender on the contacts page',
  async ({ seededUser, mockedApi, contactsPage }) => {
    await seededUser.signInAs();
    // listContacts returns ReadonlyArray<ApiContact> directly (no envelope).
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: [] });
    mockedApi.on('POST', /\/api\/contacts$/, {
      json: {
        id: 'c_new',
        owner_id: '00000000-0000-4000-8000-000000000a11',
        name: 'Dana',
        email: 'dana@example.com',
        color: '#3b82f6',
        created_at: '2026-04-25T10:00:00Z',
        updated_at: '2026-04-25T10:00:00Z',
      },
    });
    await contactsPage.goto();
  },
);

When(
  'the sender adds contact {string} {string}',
  async ({ contactsPage }, name: string, email: string) => {
    await contactsPage.addContact(name, email);
  },
);

Then('{string} appears in the contacts list', async ({ contactsPage }, name: string) => {
  await contactsPage.expectContactVisible(name);
});
