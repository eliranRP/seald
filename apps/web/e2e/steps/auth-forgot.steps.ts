import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

// Stub: real assertions deferred — the framework wiring is the value here,
// the scenario is gated by `test.fixme` until /forgot-password ships in W1.

const { Given, When, Then } = createBdd(test);

Given('the password-reset API will succeed', async ({ mockedApi }) => {
  mockedApi.on('POST', /\/api\/auth\/reset$/, { json: { ok: true } });
});

When('the user requests a reset for {string}', async ({ forgotPasswordPage }, email: string) => {
  await forgotPasswordPage.goto();
  await forgotPasswordPage.requestReset(email);
});

Then('a reset confirmation is shown', async ({ forgotPasswordPage }) => {
  await forgotPasswordPage.expectConfirmationVisible();
});
