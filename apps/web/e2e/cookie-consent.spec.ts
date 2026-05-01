import { test, expect } from '@playwright/test';

/**
 * Cookie-consent banner behaviour (T-30, /legal/cookies §4 implementation).
 *
 * These tests load the SPA at `/` so the consent runtime
 * (`/scripts/cookie-consent.js`, served in dev by the
 * `landingScriptsBridge` Vite plugin) actually runs. Each test starts
 * with a fresh `context` so cookies + DOM state never leak across
 * scenarios.
 *
 * Why this spec lives outside the BDD fixture file:
 *   `e2e/fixtures/test.ts` registers a `cookieConsent` auto-fixture
 *   that disables the banner before every navigation — useful for
 *   product flows that don't care about the banner. This spec is the
 *   one place we *want* the real banner to appear, so we import from
 *   `@playwright/test` directly and skip that auto-fixture.
 *
 * The `cf-beacon-token` meta in `apps/web/index.html` is intentionally
 * empty in dev/test, so accept-flow tests do not assert that the
 * Cloudflare beacon `<script>` materializes (the script bails when the
 * token is empty, by design — fail closed). The `consent-then-beacon`
 * test rewrites the meta value before init via `addInitScript` so we
 * can prove the wiring works end-to-end.
 */

const BANNER = '[data-testid="cookie-consent-banner"]';
const ACCEPT = '[data-testid="cookie-consent-accept"]';
const REJECT = '[data-testid="cookie-consent-reject"]';
const COOKIE_NAME = 'seald_consent_v1';

async function readConsentCookie(
  context: import('@playwright/test').BrowserContext,
): Promise<string | null> {
  const cookies = await context.cookies();
  const found = cookies.find((c) => c.name === COOKIE_NAME);
  return found ? found.value : null;
}

test.describe('cookie-consent banner (T-30)', () => {
  test('appears on first visit when no prior choice exists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(BANNER)).toBeVisible();
    // Reject button must be visually peer to Accept (EDPB 03/2022).
    await expect(page.locator(REJECT)).toBeVisible();
    await expect(page.locator(ACCEPT)).toBeVisible();
  });

  test('Accept persists the choice and dispatches a seald:consent event', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    // Capture the consent custom event so we can prove the public contract.
    const choicePromise = page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          window.addEventListener(
            'seald:consent',
            (e) => resolve((e as CustomEvent<{ choice: string }>).detail.choice),
            { once: true },
          );
        }),
    );
    await page.locator(ACCEPT).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
    expect(await choicePromise).toBe('accepted');
    expect(await readConsentCookie(context)).toBe('accepted');
  });

  test('Reject persists the choice without loading the analytics beacon', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.locator(REJECT).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
    expect(await readConsentCookie(context)).toBe('rejected');
    // No CF Web Analytics beacon must be injected on reject — even with
    // a token configured, the `loadBeacon()` path is only reachable from
    // the accept branch.
    expect(await page.locator('script[data-seald-beacon]').count()).toBe(0);
  });

  test('does not re-prompt on subsequent visits when a choice is on file', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.locator(ACCEPT).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator(BANNER)).toHaveCount(0);
    // And the cookie still says accepted on the second load.
    expect(await readConsentCookie(context)).toBe('accepted');
  });

  test('Global Privacy Control silently records reject and never shows the banner', async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'globalPrivacyControl', {
        configurable: true,
        get: () => true,
      });
    });
    await page.goto('/');
    // Banner must never appear; cookie must be persisted as rejected.
    await expect(page.locator(BANNER)).toHaveCount(0);
    // Give the consent script a tick to write the cookie.
    await expect.poll(() => readConsentCookie(context)).toBe('rejected');
  });

  test('Cloudflare beacon loads only after Accept and only when a token is configured', async ({
    page,
  }) => {
    // Replace the empty cf-beacon-token meta value with a fake token so
    // the script's fail-closed guard passes for this scenario only.
    await page.addInitScript(() => {
      const swap = (): void => {
        const m = document.querySelector('meta[name="cf-beacon-token"]');
        if (m) m.setAttribute('content', 'test-token-not-real');
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', swap, { once: true });
      } else {
        swap();
      }
    });
    await page.goto('/');
    // No beacon yet — consent has not been recorded.
    expect(await page.locator('script[data-seald-beacon]').count()).toBe(0);
    await page.locator(ACCEPT).click();
    await expect(page.locator('script[data-seald-beacon]')).toHaveCount(1);
    const beacon = page.locator('script[data-seald-beacon]').first();
    await expect(beacon).toHaveAttribute('src', /cloudflareinsights\.com\/beacon\.min\.js/);
    await expect(beacon).toHaveAttribute('data-cf-beacon', /test-token-not-real/);
  });

  test('Manage cookie preferences re-opens the banner from a previously closed state', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(ACCEPT).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
    // Public API used by the footer "Manage cookie preferences" buttons
    // (AuthShell + landing footer).
    await page.evaluate(() => {
      const api = (window as unknown as { SealdConsent?: { openBanner: () => void } }).SealdConsent;
      api?.openBanner();
    });
    await expect(page.locator(BANNER)).toBeVisible();
  });
});
