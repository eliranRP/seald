import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When } = createBdd(test);

const NEW_ACCOUNT = {
  id: '00000000-0000-4000-8000-000000000c45',
  email: 'casey@example.com',
};

Given('a signed-in account that has no profile name yet', async ({ seededUser, mockedApi }) => {
  await seededUser.signInAs({ ...NEW_ACCOUNT, fullName: '' });
  // `completeProfile` -> supabase.auth.updateUser() -> PUT /auth/v1/user. The
  // response carries the user back with the saved metadata, which auth-js
  // persists, so the welcome guard sees a complete profile.
  const issuedAt = new Date('2026-04-25T10:00:00Z').toISOString();
  mockedApi.on('PUT', /\/auth\/v1\/user/, {
    json: {
      id: NEW_ACCOUNT.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: NEW_ACCOUNT.email,
      email_confirmed_at: issuedAt,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {
        full_name: 'Casey New',
        name: 'Casey New',
        terms_accepted_at: issuedAt,
      },
      identities: [],
      created_at: issuedAt,
      updated_at: issuedAt,
    },
  });
  mockedApi.on('GET', /\/api\/envelopes(\?|$)/, { json: { items: [] } });
});

When('the user completes the welcome step as {string}', async ({ welcomePage }, name: string) => {
  await welcomePage.goto();
  await welcomePage.expectVisible();
  await welcomePage.complete(name);
});
