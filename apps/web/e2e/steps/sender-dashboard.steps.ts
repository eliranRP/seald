import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender with seeded envelopes',
  async ({ seededUser, mockedApi, dashboardPage }) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/envelopes(\?|$)/, {
      json: {
        items: [
          {
            id: 'env_1',
            title: 'MSA v1',
            short_code: 'MSAV012026',
            status: 'awaiting_others',
            original_pages: 1,
            sent_at: '2026-04-25T09:00:00Z',
            completed_at: null,
            expires_at: '2026-05-25T10:00:00Z',
            created_at: '2026-04-24T10:00:00Z',
            updated_at: '2026-04-25T09:00:00Z',
            signers: [
              {
                id: 's1',
                name: 'Bob Recipient',
                email: 'bob@example.com',
                color: '#3b82f6',
                role: 'signatory',
                signing_order: 1,
                status: 'awaiting',
                viewed_at: null,
                tc_accepted_at: null,
                signed_at: null,
                declined_at: null,
              },
            ],
          },
        ],
        next_cursor: null,
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
