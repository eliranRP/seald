import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Steps for `features/gdrive/disabled-cta.feature`. Covers the Phase 6.A
 * iter-1 LOCAL bug + the 2026-05-04 (commit 901515b) follow-up:
 *
 *   - Pre-fix the Drive CTA on `/document/new` and on the
 *     `/templates/:id/use` Step 1 "Upload a new one" panel was a
 *     `<button disabled title="…">` (an a11y dead-end — native `title`
 *     is not announced on disabled buttons, the button isn't focusable,
 *     touch users see no tooltip).
 *   - The first patch made it an enabled "Connect Drive in Settings"
 *     button that navigated to `/settings/integrations`. That broke
 *     flow continuity (the user lost their upload context).
 *   - Current contract: enabled "Connect Google Drive" button that
 *     opens the OAuth popup INLINE via `useConnectGDrive().mutate()`.
 *     The popup posts back through the AppShell-mounted message
 *     listener and the accounts query flips to connected without
 *     leaving the wizard.
 *
 * Three harness contortions worth flagging:
 *
 *  1. **Feature-flag override.** The static `FEATURE_FLAGS` constant in
 *     `packages/shared/src/feature-flags.ts` is `false` for
 *     `gdriveIntegration` on `main`; the override-host
 *     `__SEALD_FEATURE_OVERRIDES__` is read by `isFeatureEnabled` at
 *     call time so we can flip the flag from this Given without
 *     touching the constant. Production never sets this global.
 *
 *  2. **Templates store hydration.** `UseTemplatePage` reads from the
 *     module-scoped templates store and does NOT fetch on its own.
 *     Deep-linking via `page.goto('/templates/<id>/use')` would boot a
 *     fresh bundle with an empty store and render the NotFoundCard.
 *     The "When the sender visits …" step detects this pattern and
 *     hydrates by navigating to `/templates` first (the list page DOES
 *     fetch /api/templates on mount), then SPA-navigates to the wizard
 *     URL via history.pushState + popstate so module state survives.
 *
 *  3. **window.open shim.** `useConnectGDrive` calls
 *     `window.open(url, 'gdrive-oauth', POPUP_FEATURES)` after fetching
 *     the consent URL. We can't actually load Google's consent page in
 *     CI, so the activation step replaces `window.open` with a stub
 *     that records the URL it was called with — that gives us an
 *     observable signal that the click triggered the inline OAuth
 *     mutation without burning a real popup.
 */

const FLAG_OVERRIDE_INIT_SCRIPT = `(function () {
  const host = globalThis;
  host.__SEALD_FEATURE_OVERRIDES__ = Object.assign(
    {},
    host.__SEALD_FEATURE_OVERRIDES__,
    { gdriveIntegration: true },
  );
})();`;

const STUB_OAUTH_URL = 'https://accounts.google.test/o/oauth2/v2/auth?stub=1';

Given('the gdriveIntegration feature flag is on', async ({ page }) => {
  await page.addInitScript(FLAG_OVERRIDE_INIT_SCRIPT);
});

Given(
  'no Google Drive account is connected for the signed-in user',
  async ({ seededUser, mockedApi }) => {
    await seededUser.signInAs();
    // useGDriveAccounts hits /api/integrations/gdrive/accounts. An empty
    // array is the "connected=false" branch — drives the "Connect
    // Google Drive" button rendering on both /document/new and
    // /templates/:id/use.
    mockedApi.on('GET', /\/api\/integrations\/gdrive\/accounts(\?|$)/, { json: [] });
  },
);

Given('the Drive OAuth URL endpoint returns a stubbed consent URL', async ({ mockedApi }) => {
  // useConnectGDrive() GETs /api/integrations/gdrive/oauth/url before
  // calling window.open. Stubbing the response lets the activation
  // assertion observe a deterministic URL handed to the popup shim.
  mockedApi.on('GET', /\/api\/integrations\/gdrive\/oauth\/url(\?|$)/, {
    json: { url: STUB_OAUTH_URL },
  });
});

When('the sender visits {string}', async ({ page }, url: string) => {
  if (/^\/templates\/[^/]+\/use(\?|$)/.test(url)) {
    // UseTemplatePage doesn't auto-fetch templates — it reads from the
    // module-scoped store populated by /templates, /document/new, and
    // the editor route. Hard-navigating directly to the wizard URL on
    // a fresh page boot leaves the store empty → NotFoundCard. Hydrate
    // via /templates first (TemplatesListPage calls listTemplates() on
    // mount), then SPA-navigate so the store survives.
    await page.goto('/templates');
    await expect(page.getByRole('heading', { name: /templates/i }).first()).toBeVisible();
    await page.evaluate((target) => {
      window.history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, url);
    await page.waitForURL((u) => u.pathname + u.search === url || u.pathname === url);
    return;
  }
  await page.goto(url);
});

When('the sender selects the {string} document source', async ({ page }, label: string) => {
  await page.getByRole('radio', { name: new RegExp(`^${label}$`, 'i') }).click();
});

Given('a template with id {string} exists', async ({ mockedApi }, id: string) => {
  // Mirrors the Nest TemplatesController's ApiTemplate wire shape. The
  // hydrating list page (TemplatesListPage) maps `title` → summary.name.
  mockedApi.on('GET', /\/api\/templates(\?|$)/, {
    json: [
      {
        id,
        owner_id: '00000000-0000-4000-8000-000000000a11',
        title: 'Sample template for gdrive disabled-cta scenario',
        description: '',
        cover_color: '#EEF2FF',
        field_layout: [],
        tags: [],
        last_signers: [],
        has_example_pdf: false,
        uses_count: 0,
        last_used_at: null,
        created_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-05-01T10:00:00Z',
      },
    ],
  });
});

Then(
  /^the Drive source card renders a button with accessible name matching \/([^/]+)\/([gimsuy]*)$/,
  async ({ page }, body: string, flags: string) => {
    await expect(page.getByRole('button', { name: new RegExp(body, flags) })).toBeVisible();
  },
);

Then(
  /^the Drive replace button renders with accessible name matching \/([^/]+)\/([gimsuy]*)$/,
  async ({ page }, body: string, flags: string) => {
    await expect(page.getByRole('button', { name: new RegExp(body, flags) })).toBeVisible();
  },
);

Then('that button is not disabled', async ({ page }) => {
  // Both scenarios target the "Connect Google Drive" CTA. Querying by
  // accessible name keeps this step generic across both surfaces
  // (rule 4.6 — query by role/name, not test id).
  const cta = page.getByRole('button', { name: /connect google drive/i });
  await expect(cta).toBeEnabled();
  await expect(cta).not.toHaveAttribute('disabled', /.*/);
});

Then(
  'activating that button opens the Drive OAuth popup without leaving {string}',
  async ({ page }, expectedPath: string) => {
    // Replace window.open with a recording stub BEFORE the click so we
    // capture the URL `useConnectGDrive` hands to it. We resolve the
    // stub via a page-side promise so the assertion below can await
    // the actual call rather than racing it.
    await page.evaluate(() => {
      const w = window as unknown as {
        __seald_oauth_open_url?: string;
        __seald_oauth_open_resolve?: (url: string) => void;
        __seald_oauth_open_promise?: Promise<string>;
      };
      w.__seald_oauth_open_promise = new Promise<string>((resolve) => {
        w.__seald_oauth_open_resolve = resolve;
      });
      const origOpen = window.open.bind(window);
      window.open = ((url?: string | URL, target?: string, features?: string) => {
        const href = typeof url === 'string' ? url : (url?.toString() ?? '');
        w.__seald_oauth_open_url = href;
        w.__seald_oauth_open_resolve?.(href);
        // Returning null mirrors a popup-blocked browser; the mutation
        // resolves anyway and we avoid actually loading the OAuth URL.
        void target;
        void features;
        void origOpen;
        return null;
      }) as typeof window.open;
    });

    const before = new URL(page.url());
    const cta = page.getByRole('button', { name: /connect google drive/i });
    await cta.click();

    const openedUrl = await page.evaluate(async () => {
      const w = window as unknown as { __seald_oauth_open_promise?: Promise<string> };
      if (!w.__seald_oauth_open_promise) return '';
      return w.__seald_oauth_open_promise;
    });

    expect(openedUrl).toMatch(/^https:\/\/accounts\.google\.test\//);

    // The post-fix contract requires no navigation away from the
    // wizard. URL.pathname comparison is enough — the stubbed open()
    // returns null so the SPA doesn't redirect.
    const after = new URL(page.url());
    expect(after.pathname).toBe(before.pathname);
    expect(after.pathname).toBe(expectedPath.split('?')[0]);
  },
);

Then(
  'no element on the page relies on the native `title` attribute to convey the connect-in-settings hint',
  async ({ page }) => {
    // Pre-fix the surface rendered <button disabled title="Connect
    // Google Drive in Settings to use this.">. Post-fix no element
    // should carry that hint via `title`. Match common phrasings
    // tied to the Drive CTA so a regression that re-introduces the
    // tooltip — even with slightly different copy — still trips this.
    const titled = page.locator(
      '[title*="Connect Google Drive" i], [title*="Settings to use this" i], [title*="Drive in Settings" i]',
    );
    await expect(titled).toHaveCount(0);
  },
);
