# PR review checklist

Use this on every Seald pull request. It is specific to this repo. Generic
"looks good" review misses the contracts below.

Read `CODEBASE_GUIDE.md` for where code lives and `DESIGN_SYSTEM.md` for
tokens and components. `DESIGN_REVIEW.md` is the current UX backlog, not a
list of things every PR must fix.

Docs-only changes (`**/*.md`, `docs/**`, `Design-Guide/**`) do not run
`.github/workflows/ci.yml`. If the PR also touches code, review it as a
code PR.

## Standing team rules

These apply to every UI change. They are review rules. ESLint does not
enforce all of them yet.

- [ ] **Mobile-first.** Base styles are the phone layout. Desktop
      enhancements use `min-width`. Existing `@media (max-width: …)`
      queries are legacy desktop-first; do not add another one. Verify
      the change at a phone width and a desktop width.
- [ ] **Screenshots.** A UI pull request includes mobile and desktop
      screenshots of the changed screen, or e2e coverage at both
      viewports.
- [ ] **Stories at both viewports.** A component change has Storybook
      stories that render at a phone width and a desktop width, and the
      Storybook build is green. `.storybook/preview.tsx` has no viewport
      presets today; set the viewport on the story until it does.
- [ ] **Designer sign-off** before merge.
- [ ] **Shared UI only.** New visuals go through a component in
      `apps/web/src/components`. No per-screen one-off button, field, or
      badge.
- [ ] **No unused code.** No unused exports, no unused dependencies, no
      dead files. TypeScript already fails on unused locals and parameters
      (`noUnusedLocals`, `noUnusedParameters`). Unused exports and unused
      package dependencies still need a reviewer.

## 0. Scope

- [ ] The PR does one thing. Drive-by refactors are called out or split.
- [ ] Commit subjects are `type(scope): subject`.
- [ ] No secrets, `.env` files, service-role keys, or `VITE_*` values that
      are actually private.
- [ ] No new `eslint-disable`, `@ts-ignore`, non-null `!`, `as unknown as`,
      or nested ternary. Web and API lint fail the build on these in
      production source (`CODEBASE_GUIDE.md`, "Enforced today"). Tests,
      stories, and `src/test` turn the three syntax rules off. Sealing
      (`apps/api/src/sealing/**`) turns off `!` and `as unknown as` until
      2026-12-31; nested ternaries stay on there.
- [ ] `apps/web/**` changes follow the rules in this file even if CI is still
      running. Do not merge on a red `ci-success` or `playwright-success`
      job. Docs-only PRs skip `ci.yml`, `playwright.yml`, `security.yml`,
      and `lint-meta.yml` (`paths-ignore`), and Chromatic's path filter
      does not match them, so those checks are absent rather than green.
      If branch protection requires `ci-success`, a docs-only PR cannot
      satisfy it, because the job never starts. Do not treat missing
      checks as a failure of the docs, and do not treat them as a passed
      gate.

## 1. Correctness

- [ ] The change matches the user-visible behavior, not only the types.
- [ ] Route changes are reflected in `AppRoutes.tsx` and
      `apps/landing/_worker.js` (`SPA_EXACT` / `SPA_PREFIXES`). Do not add
      a `_redirects` 200 rewrite; Cloudflare turns those into 308s. The
      deploy workflow copies the worker, it does not generate a redirect
      list. See `docs/agents/RELEASE.md`.
- [ ] Nav highlighting still matches `layout/navItems.ts`. `/document/new`
      is Sign. `/document/:id` and `/document/:id/sent` stay on Documents.
- [ ] Auth boundaries still hold:
  - Sender data uses `apiClient` and `RequireAuth` / `RequireAuthOrGuest`.
  - Signer data uses `signApiClient` and `RequireSignerSession`.
  - Verify uses `verifyApiClient` and stays public.
- [ ] Guest mode still fails closed. If anonymous sign-in fails, the user
      stays on the auth page with an error. Do not navigate to `/document/new`
      with no session.
- [ ] Envelope status, field kinds, and signer status use the unions in
      `packages/shared`, not a new string written in one app only.
- [ ] List endpoints stay paginated/filtered the way the dashboard already
      expects (`features/dashboardFilters`, `envelopes/list-filters.ts`).
      A client-side filter of a partial page is a bug.
- [ ] Feature flags are read through `isFeatureEnabled`. A flag set to
      `false` must 404 the API and hide the SPA, not half-render.

## 2. Types and TypeScript

- [ ] `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
      still pass. Optional props that can be passed as `undefined` are
      declared `prop?: T | undefined`.
- [ ] No `any`, no `Function`, no `React.FC`.
- [ ] `import type` for type-only imports.
- [ ] Named exports only (stories and tests excepted).
- [ ] Index signatures and `array[i]` are checked. `noUncheckedIndexedAccess`
      makes `arr[0]` a `T | undefined`.
- [ ] Shared request/response shapes changed in `packages/shared` are
      updated on both sides. The shared package has no test script; the
      proof is an API or web test that imports the schema.

## 3. Component reuse

- [ ] New UI uses an existing component from `DESIGN_SYSTEM.md` before
      adding a folder under `components/`.
- [ ] Buttons are `Button`. Status is `StatusBadge` or `Badge`. People are
      `Avatar`. Inputs are `TextField` / `PasswordField`. Empty and loading
      states are `EmptyState` and `Skeleton`.
- [ ] Icons are Lucide through `Icon` (20px, stroke 1.75) unless the asset
      is a brand mark (Google, Drive).
- [ ] A new component folder has `tsx`, `types.ts` (`readonly` props),
      `styles.ts`, `test.tsx`, `stories.tsx`, and `index.ts`.
- [ ] New stories use a title of `L1/`, `L2/`, `L3/`, or `L4/`, with tags
      `autodocs` and `layer-N`. That is the target for new stories. On
      `main` `4a8c663` these stories have no `layer-N` tag: `VerifyPage`,
      `DownloadMenu`, `ActivityTimeline`, `SignerStack`,
      `SignerProgressBar`, `SendingOverlay`, `TemplateFlowHeader`,
      `PdfPageView` (see `CODEBASE_GUIDE.md`). Do not treat a missing tag
      on an untouched story as a regression to fix in the same PR.
- [ ] Story viewport coverage follows the standing rule above.
- [ ] Styled props that are not DOM attributes start with `$`. Review-only.
      ESLint does not enforce this.
- [ ] `{...rest}` is spread before the component's own `aria-*` / `data-*`.
      Review-only, same as the `$` rule.
- [ ] A new component folder is covered by the layer zones without editing
      a name list. `eslint/component-layers.mjs` treats every
      `src/components` folder as L1 until a story title says `L2/`–`L4/`.
      L1 is a negation glob, so a new primitive cannot import a higher
      layer.
- [ ] Signer-surface files are not given a new import of `lib/supabase`,
      `AuthProvider`, `AppStateProvider`, `features/contacts`, or
      `lib/api/apiClient`. The zone is in `apps/web/eslint.config.js`.
      New `Signing*` page folders match `./src/pages/Signing*/**`. Named
      signer components on that list still have to be added by hand.
- [ ] Deep imports use `@/…` once they climb two or more directories.
- [ ] `apps/web/src/index.ts` is not treated as the catalog. Update it only
      when something must be part of that barrel.

Pages over a few hundred lines (`EnvelopeDetailPage`, `DocumentPage`,
`DashboardPage`, `SigningFillPage`) should not grow further without
extracting a hook into `features/`. See `apps/web/PAGES_AUDIT.md`, and
re-count lines; that file's numbers are stale.

## 4. Design-system adherence

- [ ] New CSS follows the standing mobile-first rule. Which existing
      `max-width` queries a phone actually hits is in `DESIGN_SYSTEM.md`
      (Layout): `AppShell` routes redirect at 640px, and signing, verify,
      and auth do not.
- [ ] Colors, space, radius, shadow, type, and motion come from `theme`
      (`apps/web/src/styles/theme.ts`). No new hex in styles or TSX.
      ESLint bans hex literals in `src/**/*.styles.ts`, `src/**/*.tsx`,
      and `src/features/templates/tagColors.ts`. The files still listed
      in `apps/web/eslint/hex-allowlist.txt` are the design-cycle
      remainder (review by 2026-12-31). Do not add names to it.
- [ ] Spacing uses the 4px scale (`space.1` … `space.24`). No step 7, 9, 11.
- [ ] Primary actions use `Button` `variant="primary"` (indigo 600), not a
      one-off ink-900 button, unless the design is explicitly the `dark`
      variant.
- [ ] Modals use `theme.color.overlay` and `theme.z.modal`.
- [ ] Focus is visible. Do not set `outline: none` without replacing it
      with `theme.shadow.focus` or the global 2px outline.
- [ ] Hit targets on touch flows (signing, verify, `/m/send`, auth) stay
      at least 44×44px. `Button` `sm` does not do this by itself.
- [ ] Copy says **Seald**, not Sealed. The Design-Guide HTML kits are
      behind on this. Do not copy their wordmark.
- [ ] Dashboard and settings screens use `NavBar` inside `AppShell`. Do not
      reintroduce `SideBar` on one page only.
- [ ] Email HTML stays in `apps/api/src/email/templates/` and follows the
      existing table layout and inlined styles. Gmail will strip a
      `<style>` block you assumed would work. Default `.cta` is ink 900;
      if the mail should match the app's primary button, use `.cta-indigo`
      on purpose.
- [ ] A new SPA route that is a screen sets a real document title. Today
      every SPA route inherits `Seald — Dev Harness` from `index.html`.
      Do not make that worse.

## 5. Tests

- [ ] Behavior changes have a failing-then-passing test, or an existing
      test that would have caught the bug.
- [ ] Components render with `renderWithTheme`. Pages that need auth or
      queries use `renderWithProviders`. Signing pages use
      `renderSigningRoute`.
- [ ] Queries use roles and accessible names (`getByRole`), not test ids,
      unless there is no accessible handle.
- [ ] New interactive UI has a `vitest-axe` assertion, as `Button.test.tsx`
      does.
- [ ] Web coverage does not drop under the floors in
      `apps/web/vite.config.ts` (69% lines, 58% branches on `main`
      `4a8c663`; re-read the file before quoting them). Only
      `pnpm --filter web test:coverage` applies the floors.
      `pnpm --filter web test` is `vitest run` and does not. CI's web job
      runs `test:coverage`. Do not lower the floors to go green.
- [ ] API changes have a Jest spec next to the service or controller.
      e2e belongs in `apps/api/test` when the change crosses HTTP, the
      database, or PAdES.
- [ ] A migration has a paired `down/` script when its id is ≥ 0013, and
      no `*_down.sql` at the top level.
- [ ] Playwright/BDD is updated when the user-visible flow changed
      (`apps/web/e2e/`). CI's `ci.yml` only runs
      `e2e/template-sign-flow.spec.ts`; `playwright.yml` runs the rest.
      A green unit job does not prove the flow.

## 6. Security and privacy

- [ ] New routes are authenticated unless they are explicitly `@Public()`
      with a reason (health, verify, signing entry, cron, OAuth callback).
- [ ] Signer cookie flags stay HttpOnly and SameSite=Lax. Do not put the
      signer token back into `localStorage`.
- [ ] Object storage stays private. Downloads go through signed URLs issued
      by the API.
- [ ] Drive scope is unchanged: `https://www.googleapis.com/auth/drive.file`.
- [ ] Drive refresh tokens stay KMS-wrapped. Logs do not print tokens,
      PDFs, or email bodies.
- [ ] RLS is not opened up so the browser can query tables. The API is the
      gate.
- [ ] Throttling stays on `POST /sign/start`, verify, and account
      export/delete. Do not disable the global `ThrottlerGuard` outside
      tests.
- [ ] PAdES code does not call `@signpdf/utils` `extractSignature`.
      Web and API ESLint reject that import (`no-restricted-imports`).
      Verification goes through `pades-verify-helpers.ts`.
- [ ] Audit events keep `prev_event_hash` via the existing canonical-JSON
      helper. Do not reimplement the hash.
- [ ] CSP and cookie-consent changes are reflected in
      `apps/landing/public/_headers` and the contract test
      `apps/web/src/test/csp-headers.contract.test.ts`.
- [ ] `helmet` / `security-headers.ts` stays on. COOP is intentionally off
      so the Drive OAuth popup can talk to the opener. Do not "fix" that
      without a popup plan.
- [ ] Dependencies: no new package that shells out, downloads unsigned
      binaries, or wraps crypto you did not need. `pnpm audit` in CI fails
      on high production advisories.

## 7. Performance

- [ ] Heavy routes stay behind `React.lazy` (editor, signing, verify,
      mobile, integrations). Do not import `pdfjs-dist` into the sign-in
      bundle.
- [ ] `useMemo` / `useCallback` are added only when a child is memoized or
      a measurement shows a problem. `DocumentPage` is already dense with
      both; do not add more by habit.
- [ ] One `useEffect` does one thing. Keyboard shortcuts and intersection
      observers in the editor are the files to watch.
- [ ] Lists do not use the array index as `key` when rows can reorder.
- [ ] Images and PDFs respect existing size caps (`GDRIVE_CONVERSION_MAX_BYTES`
      default 25 MiB, storage bucket 50 MB). Do not raise them in a UI PR.
- [ ] React Query keys are stable and invalidated on the mutation that
      changes them. `staleTime` is 30s. A new query that refetches on every
      focus will surprise reviewers because the client disables that.

## 8. Accessibility

- [ ] Every control has a name (visible label, `aria-label`, or
      `aria-labelledby`).
- [ ] Icon-only buttons pass `label` into `Icon` or set `aria-label` on
      the button.
- [ ] Dialogs trap focus, close on Escape, and restore focus to the
      trigger.
- [ ] Status is not color alone. `StatusBadge` includes a text label; keep
      that.
- [ ] `aria-current="page"` remains on the active nav item.
- [ ] Live errors use `role="alert"` or `aria-live`.
- [ ] New motion honors `prefers-reduced-motion` (global styles already
      shorten transitions; do not override that with a long animation that
      ignores the media query).
- [ ] Do not ship `autoFocus` on a field that sits under the cookie banner
      or a modal without a reason. The jsx-a11y autofocus rule is off, so
      this will not fail lint.

## 9. How to verify locally

Install once: `pnpm install` from the repo root (Node >=22.12, pnpm 9.12).

### The gate

`packages/shared` publishes types from `dist/`. CI builds it before
typecheck. Build it first or `tsc` cannot resolve `shared`.

```sh
pnpm --filter shared build && pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test:coverage
```

`pnpm --filter web test` does not apply the coverage floors. Use
`test:coverage` when you want the same check CI runs. Web lint is
`--max-warnings=0`. API unit tests do not need Postgres; they use
in-memory fakes and a local JWKS. API e2e (`pnpm --filter api test:e2e`)
is what CI runs for PAdES. Run it when the diff touches `apps/api/src/sealing`,
migrations, or HTTP controllers.

One web file:

```sh
pnpm --filter web test -- src/components/Button/Button.test.tsx
```

Coverage:

```sh
pnpm --filter web test:coverage
```

### Running the SPA

```sh
# apps/web/.env  (see apps/web/.env.example)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_API_BASE_URL=http://localhost:3000

pnpm dev:web
```

Without a real Supabase project the app can boot if those two variables are
set to any non-empty string, but sign-in, guest mode, and every authed
screen will fail the network call. Auth screens and `/verify/:shortCode`
(error state) still render. That is not a substitute for clicking through
the flow under review.

With API + Supabase:

```sh
cp apps/api/.env.example apps/api/.env   # then fill it in
pnpm dev:api
```

Click the path you changed and the one next to it:

| If you touched | Also open |
| --- | --- |
| Dashboard, filters, tags | `/documents` empty, filtered, and one envelope detail |
| Editor | `/document/new` and an existing `/document/:id` |
| Signing | Entry without a cookie, then prep → fill → review |
| Verify | A real short code, plus a bad one |
| Auth | `/signin`, `/signup`, forgot password, a viewport ≤640px |
| Drive | Settings → Integrations with the flag on and with OAuth env missing (expect a 503 message, not a crash) |
| Mobile | Width 390 and a desktop width (1280 or wider). At ≤640px, `AppShell` routes must leave for `/m/send`. Auth, `/sign/*`, and `/verify/*` stay on the page; check those at both widths. |

Storybook, when the diff is a component:

```sh
pnpm --filter web storybook
```

Chromatic runs in CI for web PRs. Do not ignore a visual diff on a
primitive (`Button`, `TextField`, `Badge`, `NavBar`) without saying why.

### Migrations

Apply only through `apps/api/scripts/migrate.sh` or the project's normal
migration path. Confirm:

- the new file's id sorts after the highest file already in
  `apps/api/db/migrations/`. On `main` `4a8c663` that file is
  `0018_event_type_pdf_uploaded.sql`. Re-list the directory before
  citing the id.
- a paired file exists in `db/migrations/down/`
- the SQL is idempotent if it repairs old state (`IF NOT EXISTS`)

`pnpm --filter api test` includes `migrations-convention.spec.ts`.

## 10. What to reject

- A new color, spacing value, or button style copied from a page instead
  of `theme` / `Button`.
- A signer page that imports the sender API client.
- A Drive scope wider than `drive.file`.
- A top-level `*_down.sql`.
- `extractSignature` from `@signpdf/utils`.
- A SPA route missing from `apps/landing/_worker.js`.
- Tests that assert class names or styled-component hashes.
- Coverage thresholds edited down.
- A docs update that claims a layer or endpoint list the code does not have.
  `docs/CONTRIBUTING.md` and `apps/api/README.md` are already behind; do not
  extend that drift.
