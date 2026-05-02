/**
 * Unit coverage for the shared cookie-consent runtime
 * (`apps/landing/public/scripts/cookie-consent.js`).
 *
 * The script is shared between the Astro landing site and the React SPA via
 * the `landingScriptsBridge` Vite middleware (apps/web/vite.config.ts). It
 * already has a Playwright spec at `apps/web/e2e/cookie-consent.spec.ts`,
 * but that suite only exercises the browser-level wiring. The internal
 * fail-closed branches (no token, GPC enabled, double-init, malformed
 * cookie, withdrawal flow) are easier and cheaper to lock down at the
 * unit level. These tests load the raw script source from disk and
 * eval it against a clean jsdom + cookie state per test, so the assertions
 * cover behaviour the e2e suite cannot reach without contorting the
 * browser fixture.
 *
 * Why test-before-fix matters here: the script is plain ES5 (defer-loaded
 * by every page) and any regression — silently loading the beacon when
 * GPC is on, double-binding the API on hot reload, or persisting the
 * wrong cookie value — would silently violate CCPA §7025 / EDPB 03/2022.
 * These tests fail loudly on each contract drift.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// vitest runs this file with `process.cwd()` set to `apps/web`. The shared
// consent script lives in the sibling landing package — resolve relative to
// the web package root so the test works in CI and locally.
const SCRIPT_PATH = resolvePath(process.cwd(), '../landing/public/scripts/cookie-consent.js');
const SOURCE = readFileSync(SCRIPT_PATH, 'utf8');

interface SealdConsentApi {
  readonly openBanner: () => void;
  readonly getChoice: () => string | null;
  readonly _recordChoice: (c: string) => void;
}

// Reset every globals/cookie/DOM mutation the script makes between scenarios
// so each test sees a virgin environment. jsdom carries cookie state across
// tests by default, which would otherwise mask init-time branches.
function resetEnvironment(): void {
  // Wipe the consent cookie. Setting Max-Age=0 deletes it.
  document.cookie = 'seald_consent_v1=; Path=/; Max-Age=0; SameSite=Lax';
  // Drop any banner / style / beacon artifacts.
  document.querySelectorAll('#seald-consent-banner').forEach((n) => n.remove());
  document.querySelectorAll('#seald-consent-style').forEach((n) => n.remove());
  document.querySelectorAll('script[data-seald-beacon]').forEach((n) => n.remove());
  document.querySelectorAll('meta[name="cf-beacon-token"]').forEach((n) => n.remove());
  // Drop the API so the IIFE re-installs on the next eval.
  delete (window as unknown as { SealdConsent?: unknown }).SealdConsent;
  delete (window as unknown as { __SEALD_CONSENT_DISABLED?: unknown }).__SEALD_CONSENT_DISABLED;
  // Restore navigator.globalPrivacyControl — vitest doesn't auto-clean
  // configurable defineProperty replacements between tests.
  try {
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      configurable: true,
      get: () => undefined,
    });
  } catch {
    /* ignore */
  }
}

function setBeaconTokenMeta(value: string): void {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'cf-beacon-token');
  meta.setAttribute('content', value);
  document.head.appendChild(meta);
}

function setGpc(value: boolean): void {
  Object.defineProperty(navigator, 'globalPrivacyControl', {
    configurable: true,
    get: () => value,
  });
}

function loadScript(): void {
  // The script is an IIFE — eval'ing the source executes it once.
  // eslint-disable-next-line no-eval
  (0, eval)(SOURCE);
}

function getApi(): SealdConsentApi {
  const api = (window as unknown as { SealdConsent?: SealdConsentApi }).SealdConsent;
  if (!api) throw new Error('SealdConsent API was not installed');
  return api;
}

beforeEach(() => {
  resetEnvironment();
});

afterEach(() => {
  resetEnvironment();
});

describe('cookie-consent runtime — first-visit banner', () => {
  it('renders the banner with both Accept and Reject buttons given equal prominence', () => {
    loadScript();
    const banner = document.querySelector('[data-testid="cookie-consent-banner"]');
    expect(banner).not.toBeNull();
    const accept = banner?.querySelector('[data-testid="cookie-consent-accept"]');
    const reject = banner?.querySelector('[data-testid="cookie-consent-reject"]');
    expect(accept).not.toBeNull();
    expect(reject).not.toBeNull();
    // EDPB 03/2022 §35: reject must have the same visual weight as accept.
    // Both share the same parent stacking the buttons side-by-side; assert
    // that they are siblings under the actions container.
    expect(reject?.parentElement).toBe(accept?.parentElement);
  });

  it('marks the banner with role=dialog and aria-labelledby/aria-describedby', () => {
    loadScript();
    const banner = document.querySelector('[data-testid="cookie-consent-banner"]');
    expect(banner?.getAttribute('role')).toBe('dialog');
    expect(banner?.getAttribute('aria-labelledby')).toBe('seald-consent-title');
    expect(banner?.getAttribute('aria-describedby')).toBe('seald-consent-desc');
    // Title + description nodes exist under those IDs.
    expect(document.getElementById('seald-consent-title')?.textContent).toMatch(
      /cookies on seald/i,
    );
    expect(document.getElementById('seald-consent-desc')?.textContent).toMatch(/cookie policy/i);
  });
});

describe('cookie-consent runtime — fail-closed beacon loading', () => {
  it('does not inject the beacon on Accept when no cf-beacon-token meta is configured', () => {
    loadScript();
    const accept = document.querySelector(
      '[data-testid="cookie-consent-accept"]',
    ) as HTMLButtonElement | null;
    accept?.click();
    expect(document.querySelector('script[data-seald-beacon]')).toBeNull();
    // Cookie still recorded as accepted — only the side-effect is gated.
    expect(document.cookie).toContain('seald_consent_v1=accepted');
  });

  it('does not inject the beacon on Accept when cf-beacon-token is whitespace-only', () => {
    setBeaconTokenMeta('   ');
    loadScript();
    const accept = document.querySelector(
      '[data-testid="cookie-consent-accept"]',
    ) as HTMLButtonElement | null;
    accept?.click();
    expect(document.querySelector('script[data-seald-beacon]')).toBeNull();
  });

  it('injects the beacon exactly once on Accept when cf-beacon-token has a value', () => {
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    const accept = document.querySelector(
      '[data-testid="cookie-consent-accept"]',
    ) as HTMLButtonElement | null;
    accept?.click();
    accept?.click(); // second click is a no-op — banner is already removed.
    const beacons = document.querySelectorAll('script[data-seald-beacon]');
    expect(beacons.length).toBe(1);
    const beacon = beacons[0]!;
    expect(beacon.getAttribute('src')).toContain('cloudflareinsights.com/beacon.min.js');
    expect(beacon.getAttribute('data-cf-beacon')).toContain('test-token-not-real');
  });

  it('never injects the beacon on Reject, even when a token is configured', () => {
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    const reject = document.querySelector(
      '[data-testid="cookie-consent-reject"]',
    ) as HTMLButtonElement | null;
    reject?.click();
    expect(document.querySelector('script[data-seald-beacon]')).toBeNull();
    expect(document.cookie).toContain('seald_consent_v1=rejected');
  });
});

describe('cookie-consent runtime — Global Privacy Control', () => {
  it('records "rejected" without showing the banner when GPC is set', () => {
    setGpc(true);
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    expect(document.cookie).toContain('seald_consent_v1=rejected');
  });

  it('also blocks the beacon under GPC even with a token configured', () => {
    setGpc(true);
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    expect(document.querySelector('script[data-seald-beacon]')).toBeNull();
  });

  it('does not show the banner when GPC is true even on a refresh after no prior choice', () => {
    setGpc(true);
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    // Drop the API so the next loadScript() re-runs init — but keep the
    // cookie that the first run wrote.
    delete (window as unknown as { SealdConsent?: unknown }).SealdConsent;
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
  });
});

describe('cookie-consent runtime — choice persistence and re-entry', () => {
  it('does not show the banner when the cookie says "accepted" and re-loads the beacon if a token is configured', () => {
    document.cookie = 'seald_consent_v1=accepted; Path=/; SameSite=Lax';
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    // No banner, but the beacon must be re-injected on every page load
    // since accepted users still want analytics on subsequent visits.
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    expect(document.querySelector('script[data-seald-beacon]')).not.toBeNull();
  });

  it('does not show the banner when the cookie says "rejected" and never loads the beacon', () => {
    document.cookie = 'seald_consent_v1=rejected; Path=/; SameSite=Lax';
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    expect(document.querySelector('script[data-seald-beacon]')).toBeNull();
  });

  it('exposes openBanner() so the footer "Manage cookie preferences" can re-open it', () => {
    document.cookie = 'seald_consent_v1=accepted; Path=/; SameSite=Lax';
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    getApi().openBanner();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).not.toBeNull();
  });

  it('lets a user withdraw consent by re-opening the banner and clicking Reject', () => {
    document.cookie = 'seald_consent_v1=accepted; Path=/; SameSite=Lax';
    setBeaconTokenMeta('test-token-not-real');
    loadScript();
    getApi().openBanner();
    const reject = document.querySelector(
      '[data-testid="cookie-consent-reject"]',
    ) as HTMLButtonElement | null;
    reject?.click();
    // Cookie must flip from accepted to rejected — this is the
    // CCPA §7026(a)(4) "withdraw consent as easily as you gave it"
    // contract.
    expect(document.cookie).toContain('seald_consent_v1=rejected');
    // Banner is dismissed after the choice is recorded.
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
  });

  it('dispatches a "seald:consent" CustomEvent with the chosen value', () => {
    loadScript();
    const handler = vi.fn();
    window.addEventListener('seald:consent', handler as EventListener);
    const accept = document.querySelector(
      '[data-testid="cookie-consent-accept"]',
    ) as HTMLButtonElement | null;
    accept?.click();
    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0]![0] as CustomEvent<{ choice: string }>;
    expect(evt.detail.choice).toBe('accepted');
    window.removeEventListener('seald:consent', handler as EventListener);
  });

  it('returns the current choice via getChoice()', () => {
    loadScript();
    expect(getApi().getChoice()).toBeNull();
    const reject = document.querySelector(
      '[data-testid="cookie-consent-reject"]',
    ) as HTMLButtonElement | null;
    reject?.click();
    expect(getApi().getChoice()).toBe('rejected');
  });
});

describe('cookie-consent runtime — idempotency and disable hooks', () => {
  it('is a no-op when window.__SEALD_CONSENT_DISABLED is true (test fixture hook)', () => {
    (window as unknown as { __SEALD_CONSENT_DISABLED?: boolean }).__SEALD_CONSENT_DISABLED = true;
    loadScript();
    expect(document.querySelector('[data-testid="cookie-consent-banner"]')).toBeNull();
    expect((window as unknown as { SealdConsent?: unknown }).SealdConsent).toBeUndefined();
  });

  it('does not double-install the API on a second eval (defends against HMR / duplicate injection)', () => {
    loadScript();
    const first = getApi();
    loadScript();
    const second = getApi();
    expect(second).toBe(first);
  });
});
