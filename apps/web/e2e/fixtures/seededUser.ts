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

// Issue time stays pinned to the BDD clock (`fixedNow` defaults to
// 2026-04-25) so user timestamps in the seeded session stay stable.
//
// Expiry must NOT be `issued + 30 days`. auth-js compares `expires_at`
// to `Date.now()` unless a scenario installs `fixedNow`. That 30-day
// window elapsed on 2026-05-25. After that, `getSession()` tried to
// refresh `test-refresh-token`, the API mock answered 404 (no GoTrue
// handler), and `RequireAuth` sent the sender to `/signin`. Scenarios
// then timed out looking for authed controls ("Add signer", "New
// document", the primary nav). The last green Playwright run on main
// was 2026-05-20, five days before the window closed; docs-only commits
// never re-ran the suite.
//
// 2099-12-31 stays valid against both the wall clock and the frozen
// 2026-04-25 clock, matches the hand-written Playwright specs, and is
// far enough past `fixedNow` that auto-refresh does not fire mid-scenario.
const ISSUED_AT = Math.floor(new Date('2026-04-25T10:00:00Z').getTime() / 1000);
const EXPIRES_AT = Math.floor(new Date('2099-12-31T00:00:00.000Z').getTime() / 1000);

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
