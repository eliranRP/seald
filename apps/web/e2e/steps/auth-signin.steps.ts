import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the signin API will succeed for {string}', async ({ mockedApi }, email: string) => {
  mockedApi.on('POST', /\/api\/auth\/signin$/, {
    json: { ok: true, user: { id: 'usr_alice', email } },
  });
});

When(
  'the user signs in as {string} with password {string}',
  async ({ signInPage }, email: string, password: string) => {
    await signInPage.goto();
    await signInPage.signIn(email, password);
  },
);

Then('the dashboard is shown', async ({ page }) => {
  await page.waitForURL(/\/documents/);
});
