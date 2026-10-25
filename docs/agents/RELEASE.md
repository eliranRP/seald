# Release path

How a change gets from a pull request to production, taken from the
workflow files (not from comments that disagree with those files).

Two hosts:

| What | Where | Workflow |
| --- | --- | --- |
| API (`seald`), sealing worker (`seal-worker`), email worker (`email-worker`) | Supabase Edge Functions (project ref in `SUPABASE_PROJECT_REF`); pg_cron drives the workers | `.github/workflows/deploy-supabase.yml` (manual dispatch) |
| Marketing site + SPA on `seald.nromomentum.com`, and the `api.seald.nromomentum.com` proxy | Cloudflare Pages project `seald-landing` | `.github/workflows/deploy-cloudflare.yml` |

`api.seald.nromomentum.com` is a GoDaddy CNAME to `seald-landing.pages.dev`.
`apps/landing/_worker.js` proxies that host to the `seald` function with
`EDGE_PROXY_SECRET` and the client IP. The former EC2 / Docker / Caddy /
Terraform / AWS KMS setup was retired on 2026-10-25 (see
`docs/aws-exit-plan.md`).

## 1. Pull request

CI (`.github/workflows/ci.yml`) runs on pull requests (`opened`,
`synchronize`, `reopened`, `edited`) and on pushes to `main`. A
docs-only pull request still starts that workflow so commitlint runs,
including after a title edit. Lint, unit tests, web tests, Storybook,
Playwright, API e2e, and the PAdES verifier skip a docs-only diff.
`ci-success` still runs; skipped jobs are not failures. A docs-only
push to `main` skips `ci.yml` (`paths-ignore` on `push` only).

The same ignore list skips `playwright.yml`, `security.yml`, and
`lint-meta.yml`. CodeQL can still run. This doc does
not assert that `ci-success` is a required check. Treat the checks
that never start as absent, not failed and not passed.

When CI does run, `ci-success` is the aggregate. `playwright.yml` runs
the rest of the browser suite. Chromatic does not run in CI.

Merging is the release. There is no staging environment in these
workflows.

## 2. What a push to `main` deploys

GitHub skips a workflow with `paths-ignore` only when **every** file in
the push matches the ignore list. A `paths:` filter runs when **any**
file matches.

### API — `deploy-supabase.yml`

A push to `main` does **not** deploy the API. Dispatch
`Deploy (Supabase Edge Functions)` after merging an API or
`packages/shared` change:

```sh
gh workflow run deploy-supabase.yml --ref main -f ref=main -f migrate=true
```

Inputs: `ref` (branch, tag, or SHA; default `main`) and `migrate`
(default `true`). Concurrency group `deploy-supabase`,
`cancel-in-progress: false`.

GitHub Actions secrets used (names only):

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_URL`

Function env vars are Supabase function secrets (`supabase secrets set`),
not GitHub secrets. The workflow never reads them.

### Web — `deploy-cloudflare.yml`

Triggers:

- `push` to `main` when any file matches:
  - `apps/web/**`
  - `apps/landing/**`
  - `packages/shared/**`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `.github/workflows/deploy-cloudflare.yml`
- `workflow_dispatch` with input `ref` (default `main`)

An API-only push does not deploy the site. A `packages/shared` change
deploys the site; the API still needs a `deploy-supabase.yml` dispatch.
Docs-only pushes deploy nothing.

Concurrency group `deploy-cloudflare`, `cancel-in-progress: false`.

GitHub Actions secrets used (names only):

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Those `VITE_*` values are baked into the SPA at build time. Changing
them in the GitHub secret does nothing until the next Cloudflare deploy.

## 3. API deploy, step by step

1. Checkout `inputs.ref` (a SHA works).
2. `pnpm install --frozen-lockfile`, then build `shared`, `api`, and the
   function bundles (`pnpm --filter api build:edge`).
3. If `migrate` is true, run `apps/api/scripts/migrate.sh` against
   `SUPABASE_DB_URL`.
4. `supabase functions deploy` for `seald`, `seal-worker`, and
   `email-worker` (`--no-verify-jwt --use-docker`; `--use-api` hits
   HTTP 413 on the `seald` bundle).
5. Poll `https://<ref>.supabase.co/functions/v1/seald/health` up to six
   times, 10 seconds apart, and fail unless it returns 200.

### Migrations

Migrations run only in the workflow step above, never at function boot.
`migrate.sh` needs `DATABASE_URL`. It creates `public.schema_migrations`
if missing, then applies top-level `apps/api/db/migrations/*.sql` in
lexicographic order, one transaction per file, and inserts the filename.
Already-applied names are skipped. A top-level `*_down.sql` aborts the
run. Files in `migrations/down/` are never applied here.

### Workers and schedules

There is no long-lived process (`WORKER_ENABLED=false`). pg_cron calls
`seal-worker`, `email-worker`, and the `seald` cron routes with the
`X-Cron-Secret` header; the secret is the Vault entry
`seald_cron_secret` (same value as `CRON_SECRET`). Schedules are
installed by `public.seald_install_edge_schedules(<functions base URL>)`
and removed by `public.seald_remove_edge_schedules()` (migration 0049).
Check `cron.job_run_details` and `net._http_response` when a job looks
stuck.

### API rollback

The workflow has no down-migration step.

**Code.** Dispatch `deploy-supabase.yml` with `ref` set to the older
branch, tag, or SHA and `migrate=false`. Prefer reverting on `main` and
redeploying so `main` matches production.

**Schema.** Rolling the functions back does not undo SQL. `migrate.sh` will
not re-run an applied file and will not run down scripts. From `0013`
up, a paired file exists under `apps/api/db/migrations/down/`. `0001`–
`0012` have no down file. An operator applies a down script by hand and
deletes that filename from `schema_migrations`. Do this only when the
down script is safe for the data already in production. Prefer a forward
fix migration.

**Health after rollback.** Same probe as deploy:
`https://api.seald.nromomentum.com/health` returns
`{"status":"ok"}`. `GET /me` without a bearer token should be 401, not
500.

## 4. Web deploy, step by step

1. Checkout `inputs.ref` or the push ref. A SHA works here
   (`actions/checkout`), as it does for the API.
2. `pnpm install --frozen-lockfile`, `pnpm --filter shared build`.
3. Build the SPA with the three `VITE_*` secrets. Build the landing site.
4. Merge into `apps/landing/dist`:
   - rsync the SPA **except** its `index.html` (that file would replace
     the marketing home page)
   - copy the SPA shell to `app.html`
   - bundle `apps/landing/_worker.js` into `dist/_worker.js` so
     `indexing.config.js` is inlined, then delete that config file
     from `dist` if it is present. It must not be a public asset.
     See `docs/seo-indexing.md`.
5. Ensure the Pages project `seald-landing` exists (create needs the
   token's Pages Edit scope; a deploy-only token fails this step).
6. `npx wrangler pages deploy apps/landing/dist --project-name=seald-landing --branch=main`
7. Attach `seald.nromomentum.com` if it is not already attached.

Dispatching an old ref still publishes with `--branch=main`, so that
build becomes the production Pages deployment.

### Routing gotcha

The workflow header mentions `_redirects`. The job does not write one.
Cloudflare Pages coerces a 200 rewrite in `_redirects` into a 308, and
it also strips `.html`, so `/signin /app.html 200` became a redirect to
`/app` and broke signing links. The worker is the supported path.

`apps/landing/_worker.js` serves `/app` (the SPA shell) when the path is
in `SPA_EXACT` or under `SPA_PREFIXES`. Everything else is a static
asset, including the landing page at `/`.

A new React route that is missing from those two lists stays on the
marketing HTML in production. The address bar looks right; the SPA never
boots. Tests pin the prefixes that have already caused outages
(`/settings/`, `/oauth/`, `/m/`, `/sign/`, and the others in
`_worker-spa-routing.test.ts`). They do **not** diff `AppRoutes.tsx`
against the worker. Adding `/billing` will not fail CI until someone
adds a pin.

`CLAUDE.md` still says to extend a `_redirects` block in
`deploy-cloudflare.yml`. That block is not in the workflow. Update
`_worker.js`.

### Web rollback

Dispatch `deploy-cloudflare.yml` with `ref` set to the older branch, tag,
or SHA. That build is published as Pages branch `main`. Confirm
`/signin` still serves the SPA shell (view source or the document title)
and `/` still serves the landing page.

Cloudflare keeps prior deployments in the dashboard. The workflow itself
has no "rollback to previous deployment" step.

### Feature flags

`packages/shared/src/feature-flags.ts` is a compile-time `const`. The SPA
build inlines it. The API bundle also bakes it in at build time. There is no
admin toggle. Flipping `gdriveIntegration` or `gdriveMultiAccount`
requires a commit to `shared`, a push to `main` (which deploys the site),
and a `deploy-supabase.yml` dispatch for the API. A runtime check of the secret store will not
change the flag.

## 5. What to verify after a production deploy

API:

- `https://api.seald.nromomentum.com/health` → `{"status":"ok"}`
- The `deploy-supabase.yml` run ends with `bridge healthy`
- A signed-in action you changed (upload, send, or the new endpoint)
- If the migration was new: the workflow's migrate step logs
  `migrate: apply <file>`
- Cron jobs still succeed (`cron.job_run_details`)

Site:

- `https://seald.nromomentum.com/` is the landing page
- `https://seald.nromomentum.com/signin` is the SPA, not the landing page
- One real SPA path you added, including a deep link such as
  `/sign/<id>` or `/settings/integrations`
- If `VITE_*` or a feature flag changed: hard-reload. The old bundle
  will keep the old values until the browser fetches the new assets

## 6. Gotchas

- Merging an API change does not deploy it. Dispatch
  `deploy-supabase.yml`; until then production runs the previous bundle.
- Docs-only and Design-Guide-only pushes skip CI (`ci.yml`) and the
  Cloudflare deploy.
- `packages/shared` pushes deploy the site automatically; the API still
  needs a dispatch.
- Feature flags and `VITE_*` values change only on a new build, not when
  someone edits a dashboard secret and waits.
- Pages variables `API_HOSTNAME`, `API_PROXY_ORIGIN`, and the secret
  `EDGE_PROXY_SECRET` must stay set on `seald-landing`, or
  `api.seald.nromomentum.com` stops reaching the API. `EDGE_PROXY_SECRET`
  must match the function secret of the same name.
- Schema rollback is manual and incomplete before migration `0013`.
- New SPA paths belong in `_worker.js`, not in `_redirects`.
- The worker tests do not cover every route in `AppRoutes.tsx`.
- `CLOUDFLARE_API_TOKEN` without Pages Edit cannot create the project
  the first time. Later deploys only need to upload.
