import type { Page } from '@playwright/test';

/**
 * Deterministic Supabase auth state injected into the SPA's storage layer
 * before navigation. Mimics what `@supabase/supabase-js@v2` would persist
 * after a successful sign-in. Backed entirely by storage seeding — never
 * hits a real backend.
 *
 * The dual-storage `supabaseClient` reads/writes a v2 storage key derived
 * from the project ref segment of the URL. With our test URL of
 * `http://127.0.0.1:54321` the v2 client computes the key as
 * `sb-127-auth-token` (see `getStorageKey` in @supabase/auth-js). We seed
 * BOTH that key AND the `sb-test-auth-token` legacy key so any future env
 * change keeps the fixture working.
 *
 * Tests that need a different identity should call `signInAs(user)` rather
 * than mutating storage directly so the contract stays in one place.
 */
export type SeededUser = {
  id: string;
  email: string;
  fullName: string;
};

// Hardcoded id keeps fixture output deterministic — no `crypto.randomUUID`
// churn between runs.
export const DEFAULT_SEEDED_USER: SeededUser = {
  id: '00000000-0000-4000-8000-000000000a11',
  email: 'alice@example.com',
  fullName: 'Alice Example',
};

// Default frozen issue / expiry timestamps. We push expiry far past
// `fixedNow` so Supabase's auto-refresh never fires during a test run
// (the auth-js client schedules a refresh 60s before expiry; we want
// every scenario to finish well before that).
const ISSUED_AT = Math.floor(new Date('2026-04-25T10:00:00Z').getTime() / 1000);
const EXPIRES_AT = ISSUED_AT + 60 * 60 * 24 * 30; // 30 days

export class SeededUserFixture {
  constructor(private readonly page: Page) {}

  async signInAs(user: SeededUser = DEFAULT_SEEDED_USER): Promise<void> {
    const session = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: EXPIRES_AT - ISSUED_AT,
      expires_at: EXPIRES_AT,
      provider_token: null,
      provider_refresh_token: null,
      user: {
        id: user.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: user.email,
        email_confirmed_at: new Date(ISSUED_AT * 1000).toISOString(),
        phone: '',
        confirmed_at: new Date(ISSUED_AT * 1000).toISOString(),
        last_sign_in_at: new Date(ISSUED_AT * 1000).toISOString(),
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: { full_name: user.fullName, name: user.fullName },
        identities: [],
        created_at: new Date(ISSUED_AT * 1000).toISOString(),
        updated_at: new Date(ISSUED_AT * 1000).toISOString(),
      },
    };
    await this.page.addInitScript((s) => {
      // Supabase v2 storage keys we might be hit under (project-derived
      // first, then a few legacy fallbacks the dual-storage adapter
      // recognises).
      const value = JSON.stringify(s);
      window.localStorage.setItem('sb-127-auth-token', value);
      window.localStorage.setItem('sb-test-auth-token', value);
      window.localStorage.setItem('seald.auth.session', value);
      // The "keep signed in" preference must be set so the adapter writes
      // to localStorage on subsequent token refreshes.
      window.localStorage.setItem('sealed.keepSignedIn', '1');
    }, session);
  }

  async signOut(): Promise<void> {
    await this.page.addInitScript(() => {
      window.localStorage.removeItem('sb-127-auth-token');
      window.localStorage.removeItem('sb-test-auth-token');
      window.localStorage.removeItem('seald.auth.session');
    });
  }
}
