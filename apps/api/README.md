# Seald API

NestJS backend for the Seald app. Ships provider-agnostic Supabase JWT validation.

## Setup

```bash
cp .env.example .env
# Fill SUPABASE_URL with your project URL; everything else has safe defaults.
pnpm install
pnpm --filter api start:dev
```

The server listens on `PORT` (default `3000`).

## Endpoints

| Method | Path    | Auth | Response                  |
| ------ | ------- | ---- | ------------------------- |
| GET    | /health | no   | `{ status: "ok" }`        |
| GET    | /me     | yes  | `{ id, email, provider }` |

## Auth contract

All protected routes require `Authorization: Bearer <supabase-jwt>`. The token is verified against Supabase's JWKS endpoint. The provider claim is informational only — any Supabase-issued JWT is accepted regardless of OAuth provider.

| Condition                                                                    | Response                         |
| ---------------------------------------------------------------------------- | -------------------------------- |
| Missing `Authorization`                                                      | `401 { error: "missing_token" }` |
| Malformed bearer / bad signature / wrong `iss` / wrong `aud` / missing `sub` | `401 { error: "invalid_token" }` |
| Expired                                                                      | `401 { error: "token_expired" }` |

## Testing

```bash
pnpm --filter api test        # unit
pnpm --filter api test:e2e    # e2e (full Nest app)
```

Tests use a locally generated JWKS via `test/test-jwks.ts`; no network is used.

## Database

### Connection

The API speaks directly to Postgres via `pg` + Kysely. The connection string comes from `DATABASE_URL` and is validated at boot by the same zod schema as every other env var.

```
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
```

- Use the **direct** connection (`:5432`) for this long-running Nest server.
- The session pooler (`aws-…pooler.supabase.com:5432`) is only needed on IPv4-only hosts.
- The transaction pooler (`:6543`) is reserved for serverless runtimes (no prepared statements).

### Migrations

SQL migrations live at `apps/api/db/migrations/`. They are the source of truth.

To apply a migration to the live project:

1. Commit the `.sql` file.
2. Use the Supabase MCP `apply_migration` tool with `project_id=hsjlihhcwvjvybpszjsa`, `name` matching the file stem, and `query` = full file contents.
3. Verify with `list_migrations` + `list_tables`.

Forward-only. Mistakes are fixed by authoring a new numbered migration.

### Tables

| Table                 | Owner scoping                                       | Notes                                                                                                                                                                   |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts`            | `owner_id → auth.users.id` (cascade on user delete) | RLS enabled, no policies. Backend is the sole gate (connects as the admin role which bypasses RLS). Unique `(owner_id, email)`.                                         |
| `envelopes`           | `owner_id → auth.users.id` (cascade on user delete) | Signing request root. State machine: draft → awaiting_others → sealing → completed, plus declined / expired / canceled.                                                 |
| `envelope_signers`    | via parent envelope                                 | Snapshot of contact name/email/color at send time. Holds per-signer access_token_hash (SHA-256 of URL token), signature image path, and IP/UA captured at sign/decline. |
| `envelope_fields`     | via parent envelope                                 | Placements with normalized `[0,1]` coordinates top-left origin; worker flips to PDF native bottom-left at seal time.                                                    |
| `envelope_events`     | via parent envelope                                 | Append-only audit stream (created/sent/viewed/tc_accepted/signed/declined/sealed/…). Renders into audit.pdf.                                                            |
| `envelope_jobs`       | 1:1 with envelope                                   | Postgres-backed queue for worker (FOR UPDATE SKIP LOCKED). Kind = seal or audit_only. Retries with exponential backoff.                                                 |
| `outbound_emails`     | via envelope + signer                               | Email outbox. Unique (envelope_id, signer_id, kind, source_event_id) for at-most-once send.                                                                             |
| `idempotency_records` | `(user_id, idempotency_key)`                        | 24h TTL. Stores prior response for replay on repeated mutating calls.                                                                                                   |
| `email_webhooks`      | none                                                | Stub for Resend bounce/delivery events — processor is post-MVP.                                                                                                         |

## Storage

Signing artifacts live in a **private** Supabase Storage bucket named `envelopes`:

```
envelopes/
  {envelope_id}/
    original.pdf                    ← uploaded by sender
    signatures/{signer_id}.png      ← canonical signature image (600×200 PNG)
    sealed.pdf                      ← output from worker after all signers sign
    audit.pdf                       ← audit trail PDF (always produced)
```

All reads happen via short-lived signed URLs issued by the backend — no public paths.

### Bucket setup (idempotent)

The bucket is provisioned by a bootstrap script. Run this once per environment (dev, staging, prod) before the first upload:

```bash
pnpm --filter api storage:init
```

Required env:

| Var                         | Example                                     | Notes                                               |
| --------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`              | `https://<project-ref>.supabase.co`         | Same URL used for auth.                             |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` (service_role JWT, not the anon key) | Treat as secret — `.env` only, never in git.        |
| `STORAGE_BUCKET`            | `envelopes`                                 | Override only if you need per-env bucket isolation. |

The script is safe to re-run: if the bucket already exists it prints its current config and exits 0. If it doesn't exist, it creates with these settings:

- `public: false` — downloads only via signed URL
- `file_size_limit: 50 MB` — headroom over the 25 MB PDF cap to fit sealed + audit PDFs
- `allowed_mime_types: null` — per-endpoint validation (magic bytes) enforces PDF for originals and PNG for signatures

Configuration is encoded in `apps/api/scripts/ensure-storage-bucket.mjs` — modifying bucket policy means editing that script and re-running, giving a reviewable diff.

## Contacts API

All routes require a valid Supabase JWT and are scoped by `owner_id = user.id`.

| Verb   | Path            | Success         | Notable errors                          |
| ------ | --------------- | --------------- | --------------------------------------- |
| GET    | `/contacts`     | 200 `Contact[]` | 401                                     |
| POST   | `/contacts`     | 201 `Contact`   | 400, 409 `email_taken`                  |
| GET    | `/contacts/:id` | 200 `Contact`   | 400 (bad uuid), 404 `contact_not_found` |
| PATCH  | `/contacts/:id` | 200 `Contact`   | 400, 404, 409 `email_taken`             |
| DELETE | `/contacts/:id` | 204             | 400, 404                                |

Error bodies are always `{ "error": "<string>" }`.

## Running tests

| Suite                    | Command                                                              | Where                                                  |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ |
| All unit                 | `pnpm --filter api test`                                             | repo unit suites (env, db.module, repo, service, DTOs) |
| Repository only (pg-mem) | `pnpm --filter api test -- --testPathPattern contacts.repository.pg` | in-memory Postgres                                     |
| Service only             | `pnpm --filter api test -- --testPathPattern contacts.service`       | fake repo                                              |
| E2E                      | `pnpm --filter api test:e2e`                                         | in-memory repo, real Nest HTTP pipeline                |

## Signer flow (`/sign/*`)

All routes except `POST /sign/start` require the `seald_sign` session
cookie (HttpOnly, SameSite=Lax, 30-min TTL). The cookie is issued on
`/sign/start` in exchange for the 43-char URL token from the invite
email.

| Verb | Path                 | Purpose                                                                                                    |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST | `/sign/start`        | Hash token, look up signer, mint session JWT. No auth header needed.                                       |
| GET  | `/sign/me`           | Redacted view scoped to the signer (other signers' names masked).                                          |
| GET  | `/sign/pdf`          | 302 → 90-second signed URL for the original PDF.                                                           |
| POST | `/sign/accept-terms` | Idempotent. Stamps `tc_accepted_at` + `viewed_at`.                                                         |
| POST | `/sign/fields/:id`   | Fill a non-signature field (date/text/email/checkbox).                                                     |
| POST | `/sign/signature`    | Multipart PNG/JPEG → sharp-normalized 600×200 PNG. 512 KB cap.                                             |
| POST | `/sign/submit`       | Final commit. Transitions to `sealing` if last signer; enqueues `seal` job.                                |
| POST | `/sign/decline`      | Terminal for the envelope. Cascades `withdrawn_*` emails + `session_invalidated_by_decline` to co-signers. |

## Sealing pipeline (background worker)

Triggered by submit/decline. The in-process worker (`WORKER_ENABLED=true`)
claims jobs via `SELECT … FOR UPDATE SKIP LOCKED`:

- `seal` — load original.pdf, burn-in signatures + field values, hand
  to `PadesSigner` (currently `NoopPadesSigner`; real PAdES is a tracked
  follow-up once a production P12 keypair is provisioned), compute
  sealed_sha256, generate audit.pdf (event timeline + verify QR),
  upload both, flip envelope to `completed`, emit `sealed` event, queue
  `completed` emails.
- `audit_only` — for terminal declined/expired envelopes. Produces only
  audit.pdf; no sealing, no completed emails.

Failures append a `job_failed` audit event and reschedule with
exponential backoff up to `max_attempts` (default 5).

## Public verify + cron

| Verb | Path                    | Auth                                   | Purpose                                                                                                                            |
| ---- | ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/verify/:short_code`   | None                                   | Public tamper check: envelope meta, signer list, redacted events, 5-min signed URLs for sealed.pdf/audit.pdf.                      |
| POST | `/internal/cron/expire` | `X-Cron-Secret` header = `CRON_SECRET` | Flip overdue `awaiting_others` envelopes to `expired`; enqueue audit_only; emit `expired` event. Call every ~15 min via host cron. |

## Deploying (single-node)

Everything needed for a production single-node deploy lives at the repo
root: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`. Supabase
provides Postgres + Storage.

```bash
# On the deploy host (e.g. t4g.small spot + EIP):
git clone <repo> /opt/seald && cd /opt/seald
cp apps/api/.env.example apps/api/.env
# Fill in SUPABASE_*, SIGNER_SESSION_SECRET, CRON_SECRET, METRICS_SECRET,
# RESEND_API_KEY, APP_PUBLIC_URL, CORS_ORIGIN, CADDY_DOMAIN.
docker compose up -d --build
```

Caddy handles automatic HTTPS via Let's Encrypt against `CADDY_DOMAIN`.
The API listens on `:3000` inside the compose network; Caddy terminates
TLS on `:443` and proxies to it. `/internal/*` and `/metrics` are
blocked at the edge.

Host cron (optional; the worker already drains jobs):

```cron
*/15 * * * * curl -fsS -X POST -H "X-Cron-Secret: $(grep '^CRON_SECRET=' /opt/seald/apps/api/.env | cut -d= -f2)" http://localhost:3000/internal/cron/expire >/dev/null
```

Migrations (`apps/api/db/migrations/*.sql`) apply automatically on every
container boot via `scripts/entrypoint.sh` → `scripts/migrate.sh`. The
script tracks applied filenames in a `schema_migrations` ledger table so
re-runs are a no-op. Set `SKIP_MIGRATIONS=1` on API-only nodes in
horizontally-scaled deploys where one dedicated node owns migrations.
