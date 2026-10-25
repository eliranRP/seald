# Self-hosting Seald

This page covers what an operator needs to run the API and the web app.
Production runs the API as Supabase Edge Functions behind the Cloudflare
Pages worker (see "Supabase Edge Functions" below); the EC2 / Docker /
Caddy / Terraform / AWS KMS deploy was retired on 2026-10-25. The env var contract is in
`apps/api/src/config/env.schema.ts` (startup fails on any missing or malformed
required value) and `apps/api/.env.example`. Conventions and the reasoning
behind each rule are in [`CLAUDE.md`](../CLAUDE.md).

## Required services

| Service | Used for | Config |
|---|---|---|
| PostgreSQL 16 (Supabase) | Everything. Migrations run from `deploy-supabase.yml`. | `DATABASE_URL` (`postgres://` or `postgresql://`) |
| Supabase (auth + storage) | Sign-in (JWTs) and envelope files | `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE` (default `authenticated`), `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` (default `envelopes`). Supabase Storage is the only storage adapter. |
| Email provider | Invites, reminders, completion mail | `EMAIL_PROVIDER`: `resend` (`RESEND_API_KEY`; add a Resend webhook for `email.bounced` pointing at `POST /webhooks/resend` and set `RESEND_WEBHOOK_SECRET` to its `whsec_` secret so bounced signer addresses are flagged), `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`), or `logging` (the default; writes mail to the log and sends nothing, for development only). |
| Timestamp authority (TSA) | PAdES-B-T, B-LT and B-LTA | `PDF_SIGNING_TSA_URLS` (comma-separated; rotated on failure). `PDF_SIGNING_TSA_URL` is still read. The default is a public test TSA, so set your own for production. Without a TSA the seal is PAdES-B-B only. |
| Signing key: P12 | The CMS signature on every sealed PDF | See below. |
| Word conversion | `.docx` to PDF | Google Drive API (see "Word conversion"). |

### Signing key

- `PDF_SIGNING_PROVIDER=local`: `PDF_SIGNING_LOCAL_P12_BASE64` (or
  `PDF_SIGNING_LOCAL_P12_PATH` where a file can be mounted) and
  `PDF_SIGNING_LOCAL_P12_PASS`. This is the production path on Edge.
- `sslcom` is named in the enum but not implemented, and it throws at startup.
- Unset: production refuses to seal, unless `PDF_SIGNING_ALLOW_NOOP=true`
  (a staging escape hatch that leaves sealed PDFs without a CMS signature).

A provider that is set with its config missing throws at startup. It never
falls back to a weaker signer (rule S.1).

## Base env (always required)

- `CORS_ORIGIN` (the public web origin; `localhost` is refused in production).
- `APP_PUBLIC_URL` (the public web origin, used in links).
- `SIGNER_SESSION_SECRET` and `CRON_SECRET` (each >= 32 chars outside tests).
- `WORKER_ENABLED` stays `false` on Edge: pg_cron calls the worker
  functions instead. On a long-lived Node process (local development),
  `true` runs the background loops in that process: sealing, email,
  reminders, the sequential-signing sweep, bulk send and automations.
- `TC_VERSION`, `PRIVACY_VERSION`, and the `EMAIL_*` identity values have
  defaults. Set the sender identity (`EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`,
  `EMAIL_LEGAL_ENTITY`, `EMAIL_LEGAL_POSTAL`) for your own legal entity.

## Env vars per enabled flag

Flags live in `packages/shared/src/feature-flags.ts` and all ship `false`
except `gdriveIntegration`. Turn one on only with the vars below in place.

| Flag | Needs | Optional |
|---|---|---|
| `signerAccessAuth` | `SIGNER_OTP_KEY` (>= 32 chars; boot fails without it) | |
| `mcpServer` | `APPROVAL_CSRF_KEY` in production (>= 32 chars) | `MCP_DISABLED` (kill switch), `EMAIL_PROVIDER_DAILY_QUOTA`, `EMAIL_PROVIDER_MONTHLY_QUOTA` |
| `mcpOauth` (needs `mcpServer`) | | `MCP_OAUTH_ISSUER`, `MCP_OAUTH_CLIENTS` (JSON array; no dynamic registration), `MCP_OAUTH_VERIFIED_CIMD_HOSTS` |
| `publicApi` | `APPROVAL_CSRF_KEY` in production | `EMAIL_PROVIDER_DAILY_QUOTA`, `EMAIL_PROVIDER_MONTHLY_QUOTA` |
| `workflowAutomations` | `AUTOMATION_SECRETS_KEY` (64 hex characters, or base64 of 32 bytes) | `AUTOMATIONS_DISABLED` (kill switch), `API_PUBLIC_URL` (the stop link in copy mail; otherwise derived from `APP_PUBLIC_URL`) |
| `bulkSend` | | `BULK_SEND_ROWS_PER_MINUTE` (default 30, max 600) |
| `multiDocumentEnvelopes`, `signingOrder`, `fieldMetaV2`, `customReminders`, `appendCertificate`, `directLinks`, `i18n` | none beyond the base env | |

Generate keys with `openssl rand -hex 32`. Keep them in the environment or
your secret store, never in the database. Losing `AUTOMATION_SECRETS_KEY`
or changing it makes stored automation secrets unreadable, so back it up
with the database.

Mail volume: approval mail stops at 80% of the provider's daily or monthly
quota (defaults 100 and 3000, the Resend free tier). Set the quotas to your
plan's limits.

## Migrations

`Deploy (Supabase Edge Functions)` (`deploy-supabase.yml`, input
`migrate=true`) runs `apps/api/scripts/migrate.sh` against
`SUPABASE_DB_URL` before deploying the functions. The runner applies each
top-level `apps/api/db/migrations/*.sql` once, in lexical order, and records
the file name in `public.schema_migrations`. It is safe to repeat. The
functions never migrate at boot.

- Rollback scripts are in `apps/api/db/migrations/down/`. They are never run
  automatically. Run them by hand, in reverse order, only after you drain
  traffic.

## Word conversion

On Edge there is no sidecar. Set `GDRIVE_CONVERTER_REFRESH_TOKEN`: a
`drive.file` refresh token for one dedicated Google account, issued to
`GDRIVE_OAUTH_CLIENT_ID`. Word files are then uploaded to that account as a
Google Doc, exported as PDF and deleted. Users do not need Drive connected.
Drive exports cap at 10 MB of PDF. PDF and existing Google Docs imports do
not depend on it.

A self-hosted Node process can instead point `GDRIVE_GOTENBERG_URL` at a
private Gotenberg instance (no authentication, so never expose it).
`GDRIVE_CONVERSION_MAX_BYTES` (default 25 MiB) caps the input and the PDF
output.

The Drive OAuth and picker vars (`GDRIVE_OAUTH_*`, `GDRIVE_TOKEN_WRAP_KEY`,
`GDRIVE_PICKER_*`) are listed in `CLAUDE.md`. The OAuth scope is
`drive.file` only.

## Web app

The SPA is built with Vite. Set `VITE_API_BASE_URL`, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` at build time. `VITE_SENTRY_DSN` is optional.

If you host the SPA on something other than the Cloudflare Pages worker in
`apps/landing/_worker.js`, serve the same paths. Route `/approve` and
`/oauth/mcp/consent` as the worker does, with `X-Frame-Options: DENY`,
`frame-ancestors 'none'`, `Cache-Control: no-store` and
`Referrer-Policy: no-referrer`, and do not frame them. Rewrite `/d/*` and the
other SPA routes to the shell. `/api/v1` and `/mcp` belong to the API host,
not the web host.

## Reverse proxy

The Cloudflare Pages worker (`apps/landing/_worker.js`) is the reverse proxy
for the API host: it terminates TLS for `api.seald.nromomentum.com` and
forwards to the `seald` function. There is no Caddy.

## Supabase Edge Functions (no server)

The production deployment (docs/supabase-native-architecture.md) runs the
API as Supabase Edge Functions: `seald` (the whole API, the bridge while
routes move), `seal-worker` (one PAdES step per call) and `email-worker`
(one outbox batch per call), driven by pg_cron. Cut over from EC2 on
2026-10-25.

### Function secrets

Set once with `supabase secrets set --project-ref <ref> --env-file <file>`.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

- Everything in "Base env" and "Env vars per enabled flag", with
  `DATABASE_URL` pointing at the transaction pooler (port 6543).
- `WORKER_ENABLED=false`: there is no long-lived process; pg_cron drives the
  work.
- `PDF_SIGNING_PROVIDER=local`, `PDF_SIGNING_LOCAL_P12_BASE64`
  (`base64 -w0 seald.p12`), `PDF_SIGNING_LOCAL_P12_PASS`,
  `PDF_SIGNING_TSA_URLS`. The key lives in the function secrets, not an HSM.
- `GDRIVE_TOKEN_WRAP_KEY` (`openssl rand -hex 32`). Required for Drive.
- `EDGE_PROXY_SECRET` (`openssl rand -hex 32`): required by the bridge in
  production; the same value goes on the Cloudflare Pages project.

### Cloudflare Pages variables

On `seald-landing`: `API_HOSTNAME=api.seald.nromomentum.com`,
`API_PROXY_ORIGIN=https://<ref>.supabase.co/functions/v1` and the secret
`EDGE_PROXY_SECRET`. Attach `api.seald.nromomentum.com` as a custom domain
of the project. `apps/landing/_worker.js` then proxies that host to the
bridge with the real client IP; direct calls to the function URL are refused
except `/health` and `/internal/cron/*`.

### Deploy and schedules

1. Deploy: run the `Deploy (Supabase Edge Functions)` workflow (secrets
   `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`). It
   applies migrations, deploys the three functions and checks `/health`.
2. Schedules (once per project), in the SQL editor:
   `select vault.create_secret('<CRON_SECRET>', 'seald_cron_secret');`
   then `select public.seald_install_edge_schedules('https://<ref>.supabase.co/functions/v1');`
   The Vault secret must equal the `CRON_SECRET` function secret.
   `select public.seald_remove_edge_schedules();` pauses all workers.
3. DNS: `api.seald.nromomentum.com` is a CNAME to `seald-landing.pages.dev`
   and a custom domain of the Pages project, like the apex.
4. Monitor function logs, `cron.job_run_details` and `net._http_response`.

The one-time EC2 cut-over (2026-10-25) is recorded in
`docs/aws-exit-plan.md`.

### Backups

Supabase Free has none. The `Backup (Supabase database + storage)` workflow
runs nightly once `SUPABASE_DB_URL` and `BACKUP_AGE_RECIPIENT` (an `age`
public key) are set; add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to
include the `envelopes` bucket. Backups are encrypted before upload and
kept 30 days as workflow artifacts. Restore is in the workflow header.
