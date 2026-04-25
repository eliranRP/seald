import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender on the contacts page',
  async ({ seededUser, mockedApi, contactsPage }) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/contacts(\?|$)/, { json: { items: [] } });
    mockedApi.on('POST', /\/api\/contacts$/, {
      json: { id: 'c_new', name: 'Dana', email: 'dana@example.com' },
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
