import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the password-reset API will succeed', async ({ mockedApi }) => {
  // SPA calls `supabase.auth.resetPasswordForEmail()` → POST /auth/v1/recover.
  mockedApi.on('POST', /\/auth\/v1\/recover/, { json: {} });
});

When('the user requests a reset for {string}', async ({ forgotPasswordPage }, email: string) => {
  await forgotPasswordPage.goto();
  await forgotPasswordPage.requestReset(email);
});

Then('a reset confirmation is shown', async ({ forgotPasswordPage }) => {
  await forgotPasswordPage.expectConfirmationVisible();
});
