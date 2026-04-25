import type { Page } from '@playwright/test';

/**
 * Deterministic auth state injected into the SPA's storage layer before
 * navigation, mimicking what Supabase would persist after sign-in. Backed
 * by storage seeding (rule 1.3 / 5.4) — never hits a real backend.
 *
 * The shape mirrors the Supabase v2 client's local-storage key. Tests that
 * rely on a specific user identity should use `signInAs(user)` rather than
 * mutating storage directly so the contract stays in one place.
 */
export type SeededUser = {
  id: string;
  email: string;
  fullName: string;
};

export const DEFAULT_SEEDED_USER: SeededUser = {
  id: 'usr_seeded_alice',
  email: 'alice@example.com',
  fullName: 'Alice Example',
};

export class SeededUserFixture {
  constructor(private readonly page: Page) {}

  async signInAs(user: SeededUser = DEFAULT_SEEDED_USER): Promise<void> {
    const session = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.fullName },
      },
    };
    await this.page.addInitScript((s) => {
      window.localStorage.setItem('seald.auth.session', JSON.stringify(s));
      // Generic Supabase fallback key — covers older clients that look
      // here first. Either path resolves to the same seeded session.
      window.localStorage.setItem('sb-test-auth-token', JSON.stringify(s));
    }, session);
  }

  async signOut(): Promise<void> {
    await this.page.addInitScript(() => {
      window.localStorage.removeItem('seald.auth.session');
      window.localStorage.removeItem('sb-test-auth-token');
    });
  }
}
