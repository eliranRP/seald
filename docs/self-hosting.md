# Self-hosting Seald

This page covers what an operator needs to run the API and the web app on
their own infrastructure. The env var contract is in
`apps/api/src/config/env.schema.ts` (startup fails on any missing or malformed
required value) and `apps/api/.env.example`. Conventions and the reasoning
behind each rule are in [`CLAUDE.md`](../CLAUDE.md).

## Required services

| Service | Used for | Config |
|---|---|---|
| PostgreSQL 16 | Everything. Migrations run at boot. | `DATABASE_URL` (`postgres://` or `postgresql://`) |
| Supabase (auth + storage) | Sign-in (JWTs) and envelope files | `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE` (default `authenticated`), `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` (default `envelopes`). Supabase Storage is the only storage adapter. |
| Email provider | Invites, reminders, completion mail | `EMAIL_PROVIDER`: `resend` (`RESEND_API_KEY`; add a Resend webhook for `email.bounced` pointing at `POST /webhooks/resend` and set `RESEND_WEBHOOK_SECRET` to its `whsec_` secret so bounced signer addresses are flagged), `smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`), or `logging` (the default; writes mail to the log and sends nothing, for development only). |
| Timestamp authority (TSA) | PAdES-B-T, B-LT and B-LTA | `PDF_SIGNING_TSA_URLS` (comma-separated; rotated on failure). `PDF_SIGNING_TSA_URL` is still read. The default is a public test TSA, so set your own for production. Without a TSA the seal is PAdES-B-B only. |
| Signing key: KMS or P12 | The CMS signature on every sealed PDF | See below. |
| Gotenberg | Drive conversions (sidecar) | See below. |

### Signing key (pick one)

- `PDF_SIGNING_PROVIDER=kms`: `PDF_SIGNING_KMS_KEY_ID`, `PDF_SIGNING_KMS_REGION`,
  and `PDF_SIGNING_KMS_CERT_PEM` or `PDF_SIGNING_KMS_CERT_PEM_PATH`. This is
  the production path (rule S.2 covers the hand-built CMS).
- `PDF_SIGNING_PROVIDER=local`: `PDF_SIGNING_LOCAL_P12_PATH` and
  `PDF_SIGNING_LOCAL_P12_PASS`. For development and staging only.
- `sslcom` is named in the enum but not implemented, and it throws at startup.
- Unset: production refuses to seal, unless `PDF_SIGNING_ALLOW_NOOP=true`
  (a staging escape hatch that leaves sealed PDFs without a CMS signature).

A provider that is set with its config missing throws at startup. It never
falls back to a weaker signer (rule S.1).

## Base env (always required)

- `CORS_ORIGIN` (the public web origin; `localhost` is refused in production).
- `APP_PUBLIC_URL` (the public web origin, used in links).
- `SIGNER_SESSION_SECRET` and `CRON_SECRET` (each >= 32 chars outside tests).
- `WORKER_ENABLED=true` runs the background loops in that process: sealing,
  email, reminders, the sequential-signing sweep, bulk send and automations.
  It defaults to `false`, so a node without it serves the API only. A larger
  deploy can run dedicated worker nodes and keep the API nodes at `false`.
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

## Migrations at boot

The image's entrypoint (`apps/api/scripts/entrypoint.sh`) runs
`apps/api/scripts/migrate.sh` before the API starts. The runner applies each
top-level `apps/api/db/migrations/*.sql` once, in lexical order, and records
the file name in `public.schema_migrations`. It is safe to repeat.

- Set `SKIP_MIGRATIONS=1` to start a container without migrating. The runner
  takes no lock, so when several API containers boot at once, let exactly one
  run migrations and set `SKIP_MIGRATIONS=1` on the others.
- Rollback scripts are in `apps/api/db/migrations/down/`. They are never run
  at boot. Run them by hand, in reverse order, only after you drain traffic.
- Secrets: when `SEALD_API_SECRET_ID` is set, the entrypoint reads a JSON
  secret from AWS Secrets Manager. Otherwise it reads the env file.

## Gotenberg sidecar

Gotenberg converts Drive files that go through the conversion entry point
(Google Sheets and similar). It is the `gotenberg` service in the repo-root
`docker-compose.yml`, on the compose network, with no published port. Gotenberg
ships without authentication, so keep it off the public network. The compose
file caps it at 1.5 GB RAM and 1.5 vCPU. The API reaches it at
`GDRIVE_GOTENBERG_URL` (default `http://gotenberg:3000`). PDF and existing
Google Docs or docx imports do not depend on it.

`GDRIVE_CONVERSION_MAX_BYTES` (default 25 MiB) caps the input and the PDF
output. Raising it without re-checking the Gotenberg memory limit can OOM the
sidecar.

The Drive OAuth and picker vars (`GDRIVE_OAUTH_*`, `GDRIVE_TOKEN_KMS_*`,
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

`deploy/Caddyfile` terminates TLS for the API host and proxies to the API
container on port 3000. Caddy handles certificates with no extra config
beyond the domain. Keep the Gotenberg and database ports off the public
network.
