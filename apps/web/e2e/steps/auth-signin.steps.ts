import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

Given('the signin API will succeed for {string}', async ({ mockedApi }, email: string) => {
  // Real flow: SPA calls supabase.auth.signInWithPassword(), which POSTs to
  // `<VITE_SUPABASE_URL>/auth/v1/token?grant_type=password`. Respond with a
  // fully-shaped GoTrue token payload so the auth-js client persists the
  // session and `RedirectWhenAuthed` flips the user into `/documents`.
  const issuedAt = Math.floor(new Date('2026-04-25T10:00:00Z').getTime() / 1000);
  // auth-js keeps `expires_at` from the payload when it is present
  // (`_sessionResponse`). `issuedAt + 3600` is 2026-04-25T11:00Z, already
  // past on the wall clock, so the next `getSession()` would refresh and
  // the mock would 404. Same far-future instant as `SeededUserFixture`.
  // Other token mocks only send `expires_in`, which auth-js turns into
  // `now + expires_in`, so they do not share this absolute expiry.
  const expiresAt = Math.floor(new Date('2099-12-31T00:00:00.000Z').getTime() / 1000);
  mockedApi.on('POST', /\/auth\/v1\/token/, {
    json: {
      access_token: 'test-access-token',
      token_type: 'bearer',
      expires_in: expiresAt - issuedAt,
      expires_at: expiresAt,
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
