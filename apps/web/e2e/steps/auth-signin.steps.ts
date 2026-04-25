import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the signin API will succeed for {string}', async ({ mockedApi }, email: string) => {
  // Real flow: SPA calls supabase.auth.signInWithPassword(), which POSTs to
  // `<VITE_SUPABASE_URL>/auth/v1/token?grant_type=password`. Respond with a
  // fully-shaped GoTrue token payload so the auth-js client persists the
  // session and `RedirectWhenAuthed` flips the user into `/documents`.
  const issuedAt = Math.floor(new Date('2026-04-25T10:00:00Z').getTime() / 1000);
  mockedApi.on('POST', /\/auth\/v1\/token/, {
    json: {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: issuedAt + 3600,
      refresh_token: 'test-refresh-token',
      user: {
        id: '00000000-0000-4000-8000-000000000a11',
        aud: 'authenticated',
        role: 'authenticated',
        email,
        email_confirmed_at: new Date(issuedAt * 1000).toISOString(),
        confirmed_at: new Date(issuedAt * 1000).toISOString(),
        last_sign_in_at: new Date(issuedAt * 1000).toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: 'Alice Example', name: 'Alice Example' },
        identities: [],
        created_at: new Date(issuedAt * 1000).toISOString(),
        updated_at: new Date(issuedAt * 1000).toISOString(),
      },
    },
  });
  // Dashboard data the authed redirect will fetch.
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: { items: [] } });
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
