# Release path

How a change gets from a pull request to production, taken from the
workflow files (not from comments that disagree with those files).

Two hosts:

| What | Where | Workflow |
| --- | --- | --- |
| API, sealing worker, Gotenberg, Caddy | EC2, `/opt/seald`, root `docker-compose.yml` | `.github/workflows/deploy.yml` |
| Marketing site + SPA on `seald.nromomentum.com` | Cloudflare Pages project `seald-landing` | `.github/workflows/deploy-cloudflare.yml` |

`docker.yml` builds a GHCR image on every push to `main` and on tags
`v*`. The API deploy does **not** wait for that workflow. The host
checks out source and runs `docker compose up -d --build`. A comment in
`deploy.yml` still says the job runs only after the Docker workflow
succeeds. The `on:` block does not.

## 1. Pull request

CI (`.github/workflows/ci.yml`) runs on pull requests (`opened`,
`synchronize`, `reopened`, `edited`) and on pushes to `main`. A
docs-only pull request still starts that workflow so commitlint runs,
including after a title edit. Lint, unit tests, web tests, Storybook,
Playwright, API e2e, and the PAdES verifier skip a docs-only diff.
`ci-success` still runs; skipped jobs are not failures. A docs-only
push to `main` skips `ci.yml` (`paths-ignore` on `push` only).

The same ignore list skips `playwright.yml`, `security.yml`, and
`lint-meta.yml`. Chromatic uses a `paths:` allow-list, so a docs-only
PR does not start that job either. CodeQL can still run. This doc does
not assert that `ci-success` is a required check. Treat the checks
that never start as absent, not failed and not passed.

When CI does run, `ci-success` is the aggregate. `playwright.yml` runs
the rest of the browser suite. Chromatic uploads visual diffs and exits
0 even when snapshots change (`--exit-zero-on-changes`).

Merging is the release. There is no staging environment in these
workflows.

## 2. What a push to `main` deploys

GitHub skips a workflow with `paths-ignore` only when **every** file in
the push matches the ignore list. A `paths:` filter runs when **any**
file matches.

### API — `deploy.yml`

Triggers:

- `push` to `main`, ignored when the push is only:
  - `**/*.md`
  - `deploy/terraform/**`
  - `.github/workflows/terraform.yml`
  - `apps/web/**`
- `workflow_dispatch` with input `ref` (branch, tag, or SHA; default
  `main`)

A web-only push does not rebuild the API. A push that touches
`packages/shared/**` or `apps/api/**` does. Docs-only pushes do not.

The site deploy is `deploy-cloudflare.yml`. There is no
`deploy-web.yml`.

Concurrency group `deploy`, `cancel-in-progress: false`.

GitHub Actions secrets used (names only):

- `DEPLOY_SSH_HOST`
- `DEPLOY_SSH_USER`
- `DEPLOY_SSH_KEY`

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
deploys **both** the site and the API. Docs-only pushes do not.

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

1. Checkout the workflow repo (the SSH script does not deploy that
   checkout; it deploys whatever the host fetches).
2. SSH to the EC2 host and `cd /opt/seald`.
3. `chown` the tree back to the SSH user (break-glass sudo edits
   otherwise leave root-owned git objects).
4. `REF` is `inputs.ref` or `main`.
5. `git fetch`, stash local dirt, `git checkout "$REF"`,
   `git reset --hard "origin/$REF"`, `git clean -fd`.
6. `docker compose pull` (failure ignored), then
   `docker compose up -d --build --force-recreate api`.
7. For up to 30 tries, 2 seconds apart, run inside `seald-caddy-1`:

   `wget -qO- http://api:3000/health`

   and require the body to contain `"status":"ok"`. Otherwise the job
   prints the last 200 lines of API logs and fails.

### Migrations

The image entrypoint is `apps/api/scripts/entrypoint.sh`.

1. If `SEALD_API_SECRET_ID` is set, fetch that Secrets Manager JSON and
   export each key **only when the variable is currently unset**.
   `apps/api/.env` on the host wins over the secret.
2. Unless `SKIP_MIGRATIONS=1`, run `apps/api/scripts/migrate.sh`.
3. Exec `node` on the compiled API. `WORKER_ENABLED=true` in compose, so
   the sealing worker runs in the same process.

`migrate.sh` needs `DATABASE_URL`. It creates `public.schema_migrations`
if missing, then applies top-level `apps/api/db/migrations/*.sql` in
lexicographic order, one transaction per file, and inserts the filename.
Already-applied names are skipped. A top-level `*_down.sql` aborts the
boot. Files in `migrations/down/` are never applied here.

The single-node compose file leaves `SKIP_MIGRATIONS` at `0`, so every
API container boot migrates.

### API rollback

The workflow has no down-migration step.

**Code.** Dispatch `deploy.yml` with `ref` set to a **branch or tag name
that exists on `origin`**. The script resets to `origin/$REF`. A raw
commit SHA checks out, then `git reset --hard origin/<sha>` fails
because that remote ref does not exist. To roll back to a SHA, point a
branch at it and dispatch the branch name, or revert on `main` and push.

**Schema.** Rolling the image back does not undo SQL. `migrate.sh` will
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
   (`actions/checkout`); this is unlike the API script.
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
build inlines it. The API reads it when the process starts. There is no
admin toggle. Flipping `gdriveIntegration` or `gdriveMultiAccount`
requires a commit to `shared` and a push to `main`, which deploys both
the site and the API. A runtime check of the secret store will not
change the flag.

## 5. What to verify after a production deploy

API:

- `https://api.seald.nromomentum.com/health` → `{"status":"ok"}`
- The Actions log for `deploy.yml` contains `/health OK after`
- A signed-in action you changed (upload, send, or the new endpoint)
- If the migration was new: API logs contain `migrate: apply <file>` on
  first boot and `migrate: skip <file>` on the next recreate

Site:

- `https://seald.nromomentum.com/` is the landing page
- `https://seald.nromomentum.com/signin` is the SPA, not the landing page
- One real SPA path you added, including a deep link such as
  `/sign/<id>` or `/settings/integrations`
- If `VITE_*` or a feature flag changed: hard-reload. The old bundle
  will keep the old values until the browser fetches the new assets

## 6. Gotchas

- Docs-only and Design-Guide-only pushes skip CI (`ci.yml`) and both
  deploys. They do not skip `docker.yml`. That workflow has no path
  filter, so a docs-only push to `main` still builds and pushes the
  GHCR image.
- A push to `main` that touches `deploy/terraform/**` or
  `.github/workflows/terraform.yml` runs `terraform apply -auto-approve`.
  Pull requests that touch those paths only plan. The comment at the
  top of `terraform.yml` says pushes only plan. The apply step's `if:`
  is what runs. See `CODEBASE_GUIDE.md`.
- Web-only pushes skip the API deploy. API-only pushes skip Cloudflare.
- `packages/shared` pushes deploy both.
- Feature flags and `VITE_*` values change only on a new build, not when
  someone edits a dashboard secret and waits.
- API `workflow_dispatch` of a raw SHA fails on `git reset --hard origin/<sha>`.
- Schema rollback is manual and incomplete before migration `0013`.
- New SPA paths belong in `_worker.js`, not in `_redirects`.
- The worker tests do not cover every route in `AppRoutes.tsx`.
- `deploy.yml` does not wait for `docker.yml`. A green image build is
  not the production API.
- `CLOUDFLARE_API_TOKEN` without Pages Edit cannot create the project
  the first time. Later deploys only need to upload.
