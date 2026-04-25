import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender with seeded envelopes',
  async ({ seededUser, mockedApi, dashboardPage }) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/envelopes(\?|$)/, {
      json: {
        items: [{ id: 'env_1', title: 'MSA v1', status: 'awaiting_signature' }],
      },
    });
    await dashboardPage.goto();
  },
);

When('the sender filters the dashboard by {string}', async ({ dashboardPage }, status: string) => {
  await dashboardPage.filterBy(status);
});

Then('the seeded envelope appears in the list', async ({ page }) => {
  // Declarative — assert the envelope title is on the page.
  // Real implementation will tighten to a row-scoped locator when the
  // dashboard layout from W1 lands.
  await page.getByText(/MSA v1/i).waitFor();
});
