import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { Given, When, Then } = createBdd(test);

/**
 * Steps for `features/gdrive/disabled-cta.feature`. Covers the Phase 6.A
 * iter-1 LOCAL bug: pre-fix the Drive CTA on `/document/new` and on the
 * `/templates/:id/use` Step 1 "Upload a new one" panel was a
 * `<button disabled title="…">` (an a11y dead-end — native `title` is
 * not announced on disabled buttons, the button isn't focusable, touch
 * users see no tooltip). Post-fix it's an enabled, focusable
 * "Connect Drive in Settings" button that navigates to
 * `/settings/integrations`.
 *
 * Two harness contortions worth flagging:
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
 */

const FLAG_OVERRIDE_INIT_SCRIPT = `(function () {
  const host = globalThis;
  host.__SEALD_FEATURE_OVERRIDES__ = Object.assign(
    {},
    host.__SEALD_FEATURE_OVERRIDES__,
    { gdriveIntegration: true },
  );
})();`;

Given('the gdriveIntegration feature flag is on', async ({ page }) => {
  await page.addInitScript(FLAG_OVERRIDE_INIT_SCRIPT);
});

Given(
  'no Google Drive account is connected for the signed-in user',
  async ({ seededUser, mockedApi }) => {
    await seededUser.signInAs();
    // useGDriveAccounts hits /api/integrations/gdrive/accounts. An empty
    // array is the "connected=false" branch — drives the "Connect Drive
    // in Settings" button rendering on both /document/new and
    // /templates/:id/use.
    mockedApi.on('GET', /\/api\/integrations\/gdrive\/accounts(\?|$)/, { json: [] });
    // The settings/integrations destination renders cleanly with the
    // same empty-list response — the "navigates to" assertion just
    // waits for the URL to change, but we still want the page to mount
    // without bubbling an unmocked-route 404 into the React tree.
  },
);

When('the sender visits {string}', async ({ page }, url: string) => {
  if (/^\/templates\/[^/]+\/use(\?|$)/.test(url)) {
    // UseTemplatePage doesn't auto-fetch templates — it reads from the
    // module-scoped store populated by /templates, /document/new, and
    // the editor route. Hard-navigating directly to the wizard URL on
    // a fresh page boot leaves the store empty → NotFoundCard. Hydrate
    // via /templates first (TemplatesListPage calls listTemplates() on
    // mount), then SPA-navigate so the store survives.
    await page.goto('/templates');
    // Wait for the list to render at least one template card so we
    // know /api/templates resolved and the store is hydrated.
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
  // The two scenarios both target the "Connect Drive in Settings" CTA.
  // Querying by accessible name keeps this step generic across both
  // surfaces (rule 4.6 — query by role/name, not test id).
  const cta = page.getByRole('button', { name: /connect.*settings/i });
  await expect(cta).toBeEnabled();
  await expect(cta).not.toHaveAttribute('disabled', /.*/);
});

Then('activating that button navigates to {string}', async ({ page }, url: string) => {
  const cta = page.getByRole('button', { name: /connect.*settings/i });
  await cta.click();
  await page.waitForURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\?|$)'));
});

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
