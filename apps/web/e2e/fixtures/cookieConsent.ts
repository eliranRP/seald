import type { Page } from '@playwright/test';

/**
 * Cookie-consent fixture (T-30).
 *
 * The production site shows a consent banner on first visit (see
 * `apps/landing/public/scripts/cookie-consent.js`). For E2E flows that
 * are not specifically about consent UX, we want the banner to stay out
 * of the way so it doesn't intercept clicks on the form area below.
 *
 * Two ways to disable it before navigation:
 *   1. `disable(page)` — sets `window.__SEALD_CONSENT_DISABLED = true`
 *      via `addInitScript`, so the consent script's IIFE bails before
 *      doing any work. Use when no banner state is wanted at all.
 *   2. `seedAccepted(page)` / `seedRejected(page)` — pre-seeds the
 *      `seald_consent_v1` cookie so the banner does not appear and the
 *      analytics beacon either loads or stays out, matching the chosen
 *      branch.
 *
 * Both helpers must run BEFORE the first navigation; addInitScript and
 * cookie-set-via-context are no-ops once the page is rendered.
 */
export class CookieConsentFixture {
  constructor(private readonly page: Page) {}

  async disable(): Promise<void> {
    await this.page.addInitScript(() => {
      (window as unknown as { __SEALD_CONSENT_DISABLED: boolean }).__SEALD_CONSENT_DISABLED = true;
    });
  }

  async seedAccepted(): Promise<void> {
    await this.seedCookie('accepted');
  }

  async seedRejected(): Promise<void> {
    await this.seedCookie('rejected');
  }

  private async seedCookie(value: 'accepted' | 'rejected'): Promise<void> {
    const url = new URL(this.page.url() || 'http://127.0.0.1:5173/');
    await this.page.context().addCookies([
      {
        name: 'seald_consent_v1',
        value,
        domain: url.hostname,
        path: '/',
        sameSite: 'Lax',
        secure: false,
        httpOnly: false,
        // Match the script's 12-month Max-Age.
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
      },
    ]);
  }
}
