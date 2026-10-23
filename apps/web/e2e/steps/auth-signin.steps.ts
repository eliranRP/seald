import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the magic-link API will succeed', async ({ mockedApi }) => {
  // SPA calls `supabase.auth.signInWithOtp()` -> POST /auth/v1/otp.
  mockedApi.on('POST', /\/auth\/v1\/otp/, { json: {} });
});

Given('the magic-link API is rate limited', async ({ mockedApi }) => {
  mockedApi.on('POST', /\/auth\/v1\/otp/, {
    status: 429,
    json: {
      code: 429,
      error_code: 'over_email_send_rate_limit',
      msg: 'For security purposes, you can only request this after 30 seconds.',
    },
  });
});

When('the user asks for a sign-in link for {string}', async ({ signInPage }, email: string) => {
  await signInPage.goto();
  await signInPage.requestLink(email);
});

When('the user opens the sign-up page for {string}', async ({ signInPage }, email: string) => {
  await signInPage.goto(`/signup?email=${encodeURIComponent(email)}`);
});

When('the user opens the old forgot-password link', async ({ signInPage }) => {
  await signInPage.goto('/forgot-password');
});

Then('the check-your-email screen names {string}', async ({ signInPage }, email: string) => {
  await signInPage.expectCheckEmailFor(email);
});

Then('an alert says {string}', async ({ signInPage }, text: string) => {
  await signInPage.expectAlert(text);
});

Then('a status says {string}', async ({ signInPage }, text: string) => {
  await signInPage.expectStatus(text);
});

Then('the email field holds {string}', async ({ signInPage }, email: string) => {
  await signInPage.expectEmailValue(email);
});

Then('the sign-in screen is shown', async ({ page, signInPage }) => {
  await page.waitForURL(/\/signin/);
  await signInPage.expectFormVisible();
});

Then('the dashboard is shown', async ({ page }) => {
  await page.waitForURL(/\/documents/);
});
