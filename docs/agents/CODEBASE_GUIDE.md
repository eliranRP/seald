# Seald codebase guide

Audience: a reviewer who reads every development cycle. This is a map of the
repo as it exists on `main`, not a history of sprints. Where an older doc
disagrees with the code, the code wins — those drifts are called out at the
end.

Seald is an electronic-signature product. A sender uploads a PDF, places
fields, and sends it. Each recipient signs in a public flow. When everyone
has signed, the API seals a PAdES PDF and an audit certificate. Anyone with
the short code can verify the result.

Line counts, flag values, and pixel sizes in this file were checked against
`main` at `4a8c663`. Re-read the cited source if that commit is no longer
HEAD.

Production hosts:

| Surface | URL |
| --- | --- |
| Marketing site (`/`) and the SPA (every other route) | `https://seald.nromomentum.com` |
| API | `https://api.seald.nromomentum.com` |

## Stack

| Piece | Choice |
| --- | --- |
| Monorepo | pnpm 9.12 workspaces (`apps/*`, `packages/*`). Node `>=22.12` (`.nvmrc` is `22`). |
| Web SPA | React 19, Vite 8, TypeScript 5.6, React Router 7, styled-components 6, TanStack Query 5, Axios, Supabase JS |
| Landing | Astro, merged with the SPA at deploy time |
| API | NestJS 11, Express, Zod env parsing, class-validator on DTOs, Kysely + `pg` |
| Shared contract | `packages/shared` — Zod schemas and string-literal unions. No runtime UI. |
| Auth | Supabase JWT (JWKS) for senders. Separate HttpOnly cookie JWT for signers. |
| Files | Private Supabase Storage bucket `envelopes` |
| PDF | `pdfjs-dist` in the browser. `pdf-lib`, `@signpdf/*`, `@react-pdf/renderer` on the API. |
| Sealing | PAdES B-T, then B-LT (DSS), optional B-LTA. KMS, local P12, or noop signer. |
| Email | HTML templates + Postgres outbox. `logging` or Resend. |
| Drive | Google OAuth, scope `drive.file` only, optional Gotenberg conversion |
| Tests | Vitest (web), Jest (api unit + e2e), Playwright + playwright-bdd (web e2e), Storybook + Chromatic |
| Observability | Sentry on the web (`@sentry/react`). API logs via pino. Prometheus client is a dependency. |

## Repository map

```
apps/web/          React SPA. Routes, pages, components, features, styles.
apps/api/          NestJS API, SQL migrations, sealing, email, Drive.
apps/landing/      Astro marketing and legal pages. Owns `/` in production.
packages/shared/   Cross-package types, Zod contracts, feature flags.
deploy/            Caddyfile, Terraform, compose notes.
Design-Guide/      Static HTML design kits. Not imported by the app.
docs/              Contributor docs, specs, and this folder.
.github/workflows/ CI, Chromatic, Playwright, Cloudflare, Docker, Terraform.
```

`apps/web/src/` is the SPA. Path alias `@/*` maps to `apps/web/src/*`
(Vite + the web tsconfig). Use it once an import would climb two or more
`../` levels. Same-folder and one-level-up imports stay relative.

| Folder | What lives there |
| --- | --- |
| `main.tsx` | Theme provider, imports `styles/tokens.css`. |
| `App.tsx` | Query client, auth, app state, `BrowserRouter`. |
| `AppRoutes.tsx` | The route table. Source of truth for URLs. |
| `pages/` | Route-level screens. One folder per page. |
| `routes/` | Thick wrappers: upload, document editor, template editor, Drive settings. |
| `layout/` | `AppShell`, auth guards, nav config, landing redirect. |
| `components/` | Reusable UI. See `DESIGN_SYSTEM.md`. |
| `features/` | Domain API modules, React Query hooks, editor and signing logic. |
| `providers/` | Theme, Supabase auth, in-memory draft state. |
| `lib/api/` | Axios clients and the shared `QueryClient`. |
| `lib/supabase/` | Browser Supabase client. |
| `styles/` | Tokens, theme object, global CSS-in-JS, one mixin. |
| `hooks/` | Viewport, escape key, column widths. |
| `test/` | Vitest setup and render helpers. |
| `types/sealdTypes.ts` | Re-exports `shared`. |

`apps/web/src/index.ts` is a **partial library barrel**, not the app entry.
`main.tsx` is the entry. The barrel still exports an early L0–L4 subset and
only two pages. Do not treat it as the component catalog.

## Request path

```
Browser
  └─ Cloudflare Pages (seald.nromomentum.com)
       ├─ /                Astro landing (apps/landing)
       └─ other SPA routes app.html  (built from apps/web)
            ├─ Supabase Auth (sender session, JWT)
            └─ Axios  →  api.seald.nromomentum.com  (Nest)
                              ├─ Postgres (Kysely, service role, RLS on)
                              ├─ Supabase Storage (private PDFs)
                              ├─ AWS KMS (PDF signing, Drive token wrap)
                              ├─ TSA + OCSP/CRL (sealing)
                              ├─ Resend (email)
                              └─ Gotenberg (Drive doc → PDF, private network)
```

Signer requests do not send the Supabase JWT. They send the `seald_sign`
cookie. The ESLint zone in `apps/web/eslint.config.js` forbids the signer
pages and `features/signing` from importing `apiClient`, `AuthProvider`,
`AppStateProvider`, `features/contacts`, or `lib/supabase`. The zone only
covers the folders named in that config. A new signer file is unchecked
until it is added to the list.

## Web routing

Defined in `apps/web/src/AppRoutes.tsx`. Lazy routes use `React.lazy` and
`AuthLoadingScreen` as the Suspense fallback.

| Path | Screen | Who can open it |
| --- | --- | --- |
| `/signin`, `/signup`, `/forgot-password`, `/check-email` | Auth pages | Anonymous. Signed-in users are redirected. |
| `/auth/callback` | OAuth return | Public |
| `/oauth/gdrive/callback` | Drive OAuth popup bridge | Public, no app chrome |
| `/debug/auth` | Auth debug | Dev builds only |
| `/verify/:shortCode` | Public verification | Anyone. Lazy. |
| `/sign/:envelopeId` | Signer entry (token handshake) | Anyone with the link. Lazy. |
| `/sign/:envelopeId/prep` | Terms / disclosure | Needs signer cookie |
| `/sign/:envelopeId/fill` | Field fill | Needs signer cookie |
| `/sign/:envelopeId/review` | Review and submit | Needs signer cookie |
| `/sign/:envelopeId/done` | Completed | Signing subtree |
| `/sign/:envelopeId/declined` | Declined | Signing subtree |
| `/document/new` | Upload and send setup | User or guest |
| `/document/:id` | Draft editor, or read-only detail if already sent | User or guest |
| `/document/:id/sent` | Sent confirmation | User or guest |
| `/m/send`, `/m/send/drive`, `/m/send/settings` | Mobile sender | User or guest. No `AppShell`. |
| `/documents` | Dashboard | Signed-in user |
| `/signers` | Contacts (nav label is Contacts) | Signed-in user |
| `/templates`, `/templates/:id/use`, `/templates/:id/edit` | Template library and wizard | Signed-in user |
| `/settings` | Redirects to `/settings/integrations` | Signed-in user |
| `/settings/integrations` | Google Drive settings (`IntegrationsPage`) | Signed-in user. `RequireAuth`, `AppShell`, lazy. |
| `/` and `*` | `RootLanding` redirect | See below |

`apps/landing/_worker.js` `SPA_EXACT` also lists `/contacts`. The SPA has
no `/contacts` route (contacts live at `/signers`), so that path falls
through to `RootLanding`.

Guards live in `apps/web/src/layout/`:

- `RequireAuth` — user proceeds; guest is sent to `/document/new`; anonymous goes to `/signin`.
- `RequireAuthOrGuest` — user or guest. Used by the editor and mobile sender.
- `RedirectWhenAuthed` — a signed-in user on an auth page goes to `/documents`, or `/m/send` when the viewport is ≤640px.
- `RequireSignerSession` (`features/signing/`) — calls `GET /sign/me`. 401/410 returns the signer to `/sign/:envelopeId`.

`RootLanding` (`layout/RootLanding.tsx`):

- Signed-in + ≤640px → `/m/send`
- Signed-in + wider → `/documents`
- Guest + ≤640px → `/m/send`
- Guest + wider → `/document/new`
- Anonymous → `/signin`

`AppShell` (`layout/AppShell.tsx`) is the desktop chrome: 56px `NavBar`,
scrollable `<main>`, per-route `ErrorBoundary`, legal footer (privacy, terms,
cookies, accessibility, cookie preferences). At ≤640px it **replaces itself
with a redirect to `/m/send`**. Phones do not get a squeezed dashboard.

Nav items (`layout/navItems.ts`): Documents `/documents`, Sign `/document/new`,
Contacts `/signers`, Templates `/templates`. `/document/:id` keeps Documents
highlighted. Only the exact path `/document/new` highlights Sign.

New SPA routes must be listed in `apps/landing/_worker.js` (`SPA_EXACT`
or `SPA_PREFIXES`). Cloudflare Pages does not honor a 200 rewrite in
`_redirects` (it becomes a 308), so the deploy workflow does not write
one. A path missing from the worker is served as the marketing page.
See `docs/agents/RELEASE.md`.

## State and data

Provider order:

```
main.tsx:        SealdThemeProvider
App.tsx:         QueryClientProvider → AuthProvider → AppStateProvider → BrowserRouter
```

`AuthProvider` (`providers/AuthProvider.tsx`) owns the Supabase session and
the guest flag (`localStorage` key `sealed.guest`). Guest mode calls
Supabase anonymous sign-in so later API calls still have a bearer token.
"Keep me signed in" chooses `localStorage` vs `sessionStorage`
(`lib/supabase/supabaseClient.ts`, key `sealed.keepSignedIn`).

`AppStateProvider` holds the in-progress draft document in memory and, when
the user is signed in, mirrors contacts from React Query. The dashboard list
itself comes from the API, not from this provider.

`QueryClient` (`lib/api/queryClient.ts`): `staleTime` 30s, `retry` 1,
`refetchOnWindowFocus` false, mutations do not retry.

Three Axios clients:

| Client | File | Credentials |
| --- | --- | --- |
| `apiClient` | `lib/api/apiClient.ts` | `Authorization: Bearer` from the Supabase session |
| `signApiClient` | `lib/api/signApiClient.ts` | `withCredentials` (cookie `seald_sign`). No Supabase. |
| `verifyApiClient` | `lib/api/verifyApiClient.ts` | Public. No cookies. |

Feature modules under `apps/web/src/features/`:

| Module | Role |
| --- | --- |
| `envelopes/` | List, detail, upload, send, cancel, events |
| `contacts/` | Address-book CRUD |
| `templates/` | Template CRUD and "use template" (mostly imperative, not all `useQuery`) |
| `signing/` | Signer session, fill, submit, decline |
| `signingFill/` | Fill-page field model |
| `documentEditor/` | Placement, drag, keyboard, undo |
| `verify/` | Public verify + sealed download |
| `account/` | Export and delete account |
| `dashboardFilters/` | Sort and filter state for the dashboard |
| `gdriveImport/`, `gdriveExport/` | Drive picker, conversion, save-back |
| `signers/`, `downloadPdf/` | Signer helpers and download |

`packages/shared/src/feature-flags.ts` is the only flag store. Flags are
compile-time booleans. Tests and Playwright may set
`globalThis.__SEALD_FEATURE_OVERRIDES__` before boot. There is no runtime
admin UI.

| Flag | Current value | Effect when false |
| --- | --- | --- |
| `gdriveIntegration` | `true` | API 404s every `/integrations/gdrive/*` route. SPA hides Drive. |
| `gdriveMultiAccount` | `false` | Settings UI does not offer multiple Drive accounts. The table already allows more than one row. |

## Sender data flow

1. Sign in (`/signin`) or continue as guest. Guest still needs anonymous
   Supabase auth; if that is disabled, the page shows an error and stays put.
2. `/document/new` (`UploadRoute` → `UploadPage`) creates a draft envelope
   (`POST /envelopes`) and uploads the PDF (`POST /envelopes/:id/upload`).
3. `/document/:id` (`DocumentRoute` → `DocumentPage`) places fields
   (`PUT /envelopes/:id/fields`) and signers.
4. Send (`POST /envelopes/:id/send`) writes signer tokens, enqueues email,
   and routes to `/document/:id/sent`.
5. The API worker (`apps/api/src/sealing/worker.service.ts`) polls
   `envelope_jobs`. After the last signature it burns field values into the
   PDF, signs PAdES, builds the audit PDF, and stores both in the private
   bucket.

Field coordinates are normalized 0–1, top-left origin, in
`envelope_fields`. The sealer flips them to PDF bottom-left at seal time.

## Signer and verify flow

1. Email link: `/sign/:envelopeId?t=<token>`.
2. `POST /sign/start` (throttled) exchanges the token for cookie `seald_sign`
   (HttpOnly, SameSite=Lax, about 30 minutes, HS256, issuer
   `seald.nromomentum.com/sign`).
3. Prep → fill → review → `POST /sign/submit` or `POST /sign/decline`.
4. Public check: `GET /verify/:short_code`. The SPA route is
   `/verify/:shortCode`. The response includes `chain_intact` from the
   append-only `envelope_events.prev_event_hash` chain.

## API modules

Bootstrap: `apps/api/src/main.ts` (Helmet via `security-headers.ts`, CORS
allow-list, 1 MB JSON limit, global `ValidationPipe`). `app.module.ts`
registers a global `ThrottlerGuard` (5/s, 60/min, 1000/hr; off when
`NODE_ENV=test`) and a global `AuthGuard`. Routes are deny-by-default.
`@Public()` opts out.

`AuthGuard` validates Supabase JWTs against JWKS (`auth/supabase-jwt.strategy.ts`):
issuer `{SUPABASE_URL}/auth/v1`, audience `SUPABASE_JWT_AUDIENCE`.

Database: `DbModule` exposes `Kysely<Database>` (`db/db.provider.ts`,
schema in `apps/api/db/schema.ts`). Repositories are a port
(`*.repository.ts`) plus a Postgres implementation (`*.repository.pg.ts`).

| Module | Prefix | Notes |
| --- | --- | --- |
| Health | `/health`, `/me` | `/me` here is the JWT probe (`id`, `email`, `provider`), not the DSAR controller. |
| Contacts | `/contacts` | CRUD. Unique `(owner_id, email)`. |
| Envelopes | `/envelopes` | Create, list, patch, delete, upload, send, cancel, remind, signers, fields, events, download, `POST /:id/gdrive/save`. |
| Templates | `/templates` | CRUD, `POST /:id/use`, example PDF upload and fetch. |
| Signing | `/sign` | Class is `@Public()`. Most methods use `SignerSessionGuard`. |
| Verify | `/verify/:short_code` | Public. |
| Me | `/me/export`, `DELETE /me` | DSAR export and account deletion. Idempotent. |
| Cron | `/internal/cron` | `POST /expire`, `POST /flush-emails`. Header `X-Cron-Secret`. |
| Drive | `/integrations/gdrive` | OAuth, accounts, file proxy, picker credentials. 404 when the flag is off. 503 when OAuth env is missing. |
| Conversion | `/integrations/gdrive/conversion` | Create, poll, cancel a Gotenberg job. |
| Sealing | no HTTP | Worker only. |
| Email | no HTTP | Outbox + worker. Cron flushes it. |

Signing routes (`signing/signing.controller.ts`): `POST /sign/start`,
`GET /sign/me`, `GET /sign/pdf`, `POST /sign/accept-terms`,
`POST /sign/esign-disclosure`, `POST /sign/intent-to-sign`,
`POST /sign/withdraw-consent`, `POST /sign/fields/:field_id`,
`POST /sign/submit`, `POST /sign/decline`, `POST /sign/signature`.

OAuth scope is hard-coded to `https://www.googleapis.com/auth/drive.file`
in `integrations/gdrive/oauth-pkce.ts`. Do not add `drive.readonly` or
`drive`.

### Migrations

`apps/api/scripts/migrate.sh` applies `apps/api/db/migrations/*.sql` in
lexicographic order and records filenames in `public.schema_migrations`.
It refuses a top-level `*_down.sql`. Rollbacks live in
`apps/api/db/migrations/down/`. From `0013` onward every up file needs a
paired down file (`apps/api/test/migrations-convention.spec.ts`).

| File | Purpose |
| --- | --- |
| `0001_contacts.sql` | `contacts` + RLS |
| `0002_envelopes.sql` | Envelopes, signers, fields, events, jobs |
| `0003_outbound_emails.sql` | Email outbox |
| `0004_envelope_sender.sql` | Sender name and email snapshot |
| `0005_signer_initials.sql` | Initials image path |
| `0006_event_type_cancel.sql` | Cancel event type |
| `0007_event_chain_hash.sql` | `prev_event_hash` |
| `0008_templates.sql` | Templates |
| `0009_template_tags_signers.sql` | Template tags and last signers |
| `0010_template_example_pdf.sql` | Example PDF path |
| `0011_event_type_esign_ux.sql` | Disclosure, intent, consent-withdrawn events |
| `0012_preserve_envelopes_on_user_delete.sql` | Keep envelopes when a user is deleted; tombstones |
| `0013_gdrive_accounts.sql` | KMS-wrapped Drive refresh tokens |
| `0014_repair_gdrive_accounts.sql` | Idempotent repair |
| `0015_enable_rls_missing_tables.sql` | RLS on tombstones and `schema_migrations` |
| `0016_envelopes_tags.sql` | `envelopes.tags` jsonb |
| `0017_gdrive_envelope_exports.sql` | Export rows + owner policy |
| `0018_event_type_pdf_uploaded.sql` | `pdf_uploaded` event |

RLS is on and usually has **no policies**, which means the anon/authenticated
Supabase roles cannot read the tables. The API connects with `DATABASE_URL`
as a role that bypasses RLS. That is intentional. Do not add broad policies
so the browser can query Postgres directly.

### Sealing (names only)

All of this is `apps/api/src/sealing/`.

| File | Role |
| --- | --- |
| `sealing.module.ts` | Signer factory: KMS, else P12, else noop. Misconfig must throw, not downgrade. |
| `sealing.service.ts` | Burn-in, sign, audit PDF, enqueue email |
| `worker.service.ts` | Job poller |
| `pades-signer.ts` | `KmsPadesSigner`, `P12PadesSigner`, `NoopPadesSigner` |
| `p12-tsa-signer.ts` | Local P12 signer with an optional timestamp |
| `kms-cms-signer.ts` | CMS built by hand so the private key stays in KMS |
| `burn-in-fields.ts` | Draws completed field values onto the PDF pages |
| `audit-pdf.tsx` | React-PDF certificate of completion |
| `tsa-client.ts` | RFC 3161 client. Rotates `PDF_SIGNING_TSA_URLS`. |
| `dss-injector.ts`, `dss-incremental-update.ts` | B-T → B-LT |
| `revocation-fetcher.ts`, `cert-chain-extractor.ts` | OCSP/CRL and cert metadata |
| `archive-timestamp.ts` | Optional B-LTA |
| `pades-verify-helpers.ts` | Read `/Contents` by DER length |

Never call `@signpdf/utils` `extractSignature`. It strips trailing `0x00`
bytes and corrupts CMS that legitimately ends in `0x00`.

### Shared package

`packages/shared/src/index.ts` re-exports:

| File | Contents |
| --- | --- |
| `signer.ts` | `SignerStatus`, `FieldKind` (`signature`, `initials`, `date`, `text`, `checkbox`, `email`), `SignatureMode`, `SignatureValue` |
| `envelope-contract.ts` | Zod request/response schemas, status enums, `ErrorSlug` |
| `templates.ts` | Template field and page-rule types |
| `compliance.ts` | ESIGN disclosure version, retention default, auth tier |
| `feature-flags.ts` | Flags above |

The package's `test` and `lint` scripts are no-ops. Contract changes need
tests in `apps/api` or `apps/web`.

### Landing

`apps/landing` is the marketing site plus legal pages: home, contact, DSAR,
imprint, DPA, terms, privacy, cookies, accessibility, AUP, e-sign disclosure,
sub-processors, responsible disclosure. `public/_headers` sets the
Cloudflare Pages CSP. `public/scripts/cookie-consent.js` is also served by
the Vite dev server (see `landingScriptsBridge` in `apps/web/vite.config.ts`)
so local SPA and production share one consent script.

## How to run

From the repo root, after `pnpm install`:

```sh
# SPA (needs apps/web/.env or the variables below)
pnpm dev:web          # http://127.0.0.1:5173

# API
cp apps/api/.env.example apps/api/.env
pnpm dev:api          # http://127.0.0.1:3000

# Marketing site
pnpm dev:landing
```

Web env (`apps/web/.env.example`):

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_BASE_URL          # http://localhost:3000 locally
```

The SPA throws at startup if either Supabase variable is missing
(`lib/supabase/supabaseClient.ts`). Guest mode also needs anonymous sign-in
enabled on that Supabase project. Without it, "Skip — try it without an
account" stays on `/signin` and shows an error.

Full stack in Docker: root `docker-compose.yml` runs `api` (migrations on
boot), `gotenberg` (no public port), and `caddy`. `deploy/docker-compose.yml`
is a leftover Gotenberg-only file.

## How to test and build

Local gate that matches CI's main checks. `packages/shared` publishes
types from `dist/`, and CI builds it before typecheck (`ci.yml`). Build
it first or `tsc` cannot resolve `shared`.

```sh
pnpm --filter shared build && pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test:coverage
```

`pnpm --filter web test` is `vitest run`. It does not collect coverage, so
the floors in `apps/web/vite.config.ts` (69% lines, 58% branches on
`main` `4a8c663`) are not applied. CI runs `test:coverage` (`ci.yml`).
A green `web test` can still fail CI on coverage.

| Command | What it runs |
| --- | --- |
| `pnpm --filter web test` | Vitest once, jsdom. No coverage floors. |
| `pnpm --filter web test:coverage` | Vitest with the floors in `vite.config.ts` |
| `pnpm --filter web test -- src/components/Button/Button.test.tsx` | One file |
| `pnpm --filter web e2e` | Playwright |
| `pnpm --filter web bdd:smoke` | BDD scenarios tagged `@smoke` |
| `pnpm --filter api test` | Jest unit |
| `pnpm --filter api test:e2e` | Jest e2e, includes PAdES |
| `pnpm --filter web storybook` | Storybook on port 6006 |
| `pnpm --filter web build` | `tsc --noEmit` then Vite build |
| `pnpm --filter api build` | `nest build` |
| `pnpm --filter landing build` | Astro build |
| `pnpm -r build` | Every workspace package |

Render helpers:

- `src/test/renderWithTheme.tsx` — theme only. Use for components.
- `src/test/renderWithProviders.tsx` — theme, QueryClient, stub auth, real `AppStateProvider`. Use for pages.
- `src/test/renderSigningRoute.tsx` — memory router for `/sign/*`.

Component tests should query by role and name. `vitest-axe` is set up in
`src/test/setup.ts`. Coverage excludes stories, `*.styles.ts`, and `*.types.ts`.

### CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.
Markdown, `docs/**`, and `Design-Guide/**` are ignored, so a docs-only PR
does not run this workflow.

Jobs, in order: path filter, install, lint (typecheck + lint), pnpm audit,
API unit, web Vitest with coverage, Storybook build, one Playwright spec
(`e2e/template-sign-flow.spec.ts`), API e2e (LocalStack KMS), `pades-verify`,
then an aggregate `ci-success` job.

Other workflows that run on pull requests (same docs `paths-ignore` as
CI, except Chromatic which uses a `paths:` allow-list): `playwright.yml`
(full e2e + BDD), `chromatic.yml` (visual baselines; auto-accept on
`main`; `--exit-zero-on-changes` so a diff does not fail the job),
`security.yml` (Trivy, gitleaks, pnpm audit), `lint-meta.yml` (actionlint,
gherkin-lint, cspell).

Deploy and infra: `deploy.yml` (SSH + Docker Compose for the API on push
to `main`, ignores `apps/web/**`), `deploy-cloudflare.yml` (landing + SPA
merge), `docker.yml` (GHCR image on every push to `main` and on `v*` tags;
no path filter), `terraform.yml`. A pull request that touches
`deploy/terraform/**` only plans. A **push to `main`** that touches
`deploy/terraform/**` or `terraform.yml` runs `terraform apply -auto-approve`
(`terraform.yml` apply step: push to `main`, or a manual dispatch whose
`action` input is `apply`). The comment at the top of that workflow says
pushes only plan. The step `if:` is what runs. Manual dispatch can also
`plan` or `destroy`.

Dispatch-only ops workflows (they do not run on push): `prod-diagnose.yml`,
`prod-restore.yml`, `inspect-prod-containers.yml`, `restart-gotenberg.yml`,
`seed-secrets-manager.yml`, `set-app-public-url.yml`,
`set-gdrive-oauth-env.yml`, `set-gdrive-picker-env.yml`.

### Deploy shape

- SPA and landing: Cloudflare Pages project `seald-landing`. The workflow
  builds both, renames the SPA `index.html` to `app.html`, and copies
  `apps/landing/_worker.js` into the deploy. Step-by-step is in
  `docs/agents/RELEASE.md`.
- API: EC2, Caddy, the root compose file. `deploy/Caddyfile` no longer
  serves the web bundle.

## Conventions reviewers enforce

TypeScript (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`,
`noUnusedParameters`. Optional props that may be explicitly `undefined`
are written `prop?: T | undefined`.

Web ESLint (`apps/web/eslint.config.js`) runs at `--max-warnings=0`.
Only the rules below fail that command. `docs/CONTRIBUTING.md` describes
a longer list; several of those items are review-only until a follow-up
PR turns them into lint rules.

Enforced today:

- Named exports only (`import/no-default-export`). Stories, tests, and Vite/Storybook config are exempt.
- `import type` for types (`consistent-type-imports`).
- No `React.FC` / `FunctionComponent` (`no-restricted-syntax`).
- Named components are function declarations. Inline components are arrow functions (`react/function-component-definition`).
- Deep relative imports (`../../…`) are banned outside tests and stories (`no-restricted-imports`).
- Hex literals are banned in `src/components/**/*.styles.ts` only. Page styles and TSX are not covered.
- Layer zones and the signer-import ban, for the folders named in the config.

Documented, and not yet enforced by ESLint (a separate PR is adding the
rules). Reviewers still apply them. The tree already breaks several:
`as unknown as` in `lib/pdf.ts`, `lib/pdfjsWorker.ts`,
`hooks/useColumnWidths.ts`, `features/templates/templatesApi.ts`, and
`features/documentEditor/model/lib.ts`; a nested ternary in
`components/Toast/Toast.tsx`; a non-null assertion in
`pages/VerifyPage/VerifyPage.tsx`.

- Styled-only props start with `$` so they are not forwarded to the DOM.
- `{...rest}` is spread before the component's own `aria-*` and `data-*` attributes.
- No `eslint-disable`. `reportUnusedDisableDirectives` is off, so a stale disable does not fail lint either.
- No non-null `!`. No `as unknown as`. No nested ternaries.
- `forwardRef` components set `displayName`. The React preset's `react/display-name` only partly covers this.

Component folder, when the component is a real design-system citizen:

```
ComponentName.tsx
ComponentName.types.ts    readonly props
ComponentName.styles.ts   theme tokens, $transient props
ComponentName.test.tsx
ComponentName.stories.tsx
index.ts
```

New stories should use a title of `L1/`, `L2/`, `L3/`, or `L4/` and tags
`autodocs` plus `layer-N`. That is the target, not the current tree.
On `4a8c663`, these stories have no `layer-N` tag: `VerifyPage` (title
`Pages/VerifyPage`), `DownloadMenu`, `ActivityTimeline`, `SignerStack`,
`SignerProgressBar`, `SendingOverlay`, `TemplateFlowHeader` (title
`L2 / TemplateFlowHeader`), `PdfPageView` (title `L3 Widgets/PdfPageView`).

Commit messages: `type(scope): subject`. Husky runs lint-staged and
`tsc --noEmit`. Do not use `--no-verify`. Do not amend or force-push to
rewrite a hook failure; add a new commit.

`apps/api/README.md` is not the endpoint catalog. It still documents only
`GET /health` and `GET /me`. Use the controllers.

## Doc drift (do not "fix" the code to match these)

| Document | What it still says | What the code does |
| --- | --- | --- |
| `docs/CONTRIBUTING.md`, `docs/layers.md` | Phase-1 library, `.eslintrc.cjs`, `pnpm dev` at the root, a dozen components, L4 empty | Full product. ESLint flat config. Root scripts are `dev:web` / `dev:api` / `dev:landing`. L4 is the shell, providers, and pages. |
| `apps/web/src/index.ts` | Public component surface | Partial. Many components are imported by path. |
| `apps/web/PAGES_AUDIT.md` | `DocumentPage` 1463 lines, `DashboardPage` 332, `EnvelopeDetailPage` 765 | On `main` `4a8c663`, `wc -l` was DocumentPage 710, DashboardPage 606, EnvelopeDetailPage 971, SigningFillPage 580. Re-count before citing them. The extraction advice is still directionally right. |
| `apps/api/README.md` | Two HTTP routes | Full surface in the table above. |
| `URL_AUDIT.md` | `/verify/:shortCode` might be unwired | It is wired in `AppRoutes.tsx`. |
| Design-Guide HTML | Product name "Sealed", left rail + top nav | Product name "Seald", top nav only. See `DESIGN_SYSTEM.md`. |

## Invariants that are easy to break

- Signer UI must not import `apiClient`, `AuthProvider`, `AppStateProvider`, `features/contacts`, or `lib/supabase`.
- Drive scope stays `drive.file`.
- Down migrations stay in `migrations/down/`.
- PAdES verification uses `pades-verify-helpers.ts`.
- Feature-off Drive returns 404, not an empty 200.
- New SPA paths are added to `apps/landing/_worker.js`.
- Secrets (`GDRIVE_OAUTH_CLIENT_SECRET`, service-role keys, KMS material) never land in git or in `VITE_*` variables.
