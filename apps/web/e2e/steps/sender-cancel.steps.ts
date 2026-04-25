import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given(
  'a signed-in sender viewing an in-flight envelope',
  async ({ seededUser, mockedApi, page }) => {
    await seededUser.signInAs();
    mockedApi.on('GET', /\/api\/envelopes\/env_inflight$/, {
      json: { id: 'env_inflight', status: 'awaiting_signature', title: 'NDA' },
    });
    mockedApi.on('POST', /\/api\/envelopes\/env_inflight\/cancel$/, {
      json: { ok: true, status: 'cancelled' },
    });
    await page.goto('/document/env_inflight');
  },
);

When('the sender cancels the envelope', async ({ documentEditorPage }) => {
  await documentEditorPage.cancelEnvelope();
});

Then('the envelope is marked cancelled', async ({ page }) => {
  await page.getByText(/cancelled/i).waitFor();
});
