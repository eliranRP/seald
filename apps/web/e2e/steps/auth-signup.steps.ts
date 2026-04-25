import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the signup API will succeed', async ({ mockedApi }) => {
  // Real flow: SPA calls supabase.auth.signUp(), POST to
  // `<VITE_SUPABASE_URL>/auth/v1/signup`. We respond with `session: null`
  // (Supabase requires email confirmation), which triggers
  // `onNeedsEmailConfirmation` → navigate to `/check-email`.
  const issuedAt = Math.floor(new Date('2026-04-25T10:00:00Z').getTime() / 1000);
  mockedApi.on('POST', /\/auth\/v1\/signup/, {
    json: {
      user: {
        id: '00000000-0000-4000-8000-000000000c45',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'casey@example.com',
        email_confirmed_at: null,
        confirmed_at: null,
        last_sign_in_at: null,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { name: 'Casey New' },
        identities: [],
        created_at: new Date(issuedAt * 1000).toISOString(),
        updated_at: new Date(issuedAt * 1000).toISOString(),
      },
      session: null,
    },
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
