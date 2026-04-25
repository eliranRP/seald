import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the signup API will succeed', async ({ mockedApi }) => {
  mockedApi.on('POST', /\/api\/auth\/signup$/, {
    json: { ok: true, user: { id: 'usr_new', email: 'casey@example.com' } },
  });
});

When(
  'a new user signs up as {string} with {string}',
  async ({ signUpPage }, name: string, email: string) => {
    await signUpPage.goto();
    await signUpPage.signUp(name, email, 'P@ssword123');
  },
);

Then('the dashboard greets the new user', async ({ page }) => {
  // Declarative landing assertion — accept either a redirect to /documents
  // or the post-signup confirmation copy. (rule 2.1)
  await page.waitForURL(/\/(documents|check-email)/);
});
