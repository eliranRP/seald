# AWS exit plan: run Seald on Supabase Free

Status: **completed (2026-10-25). Archived; kept as a historical record.**
Goal was $0/month hosting, with as much as possible inside Supabase.

> **Outcome.** Production now runs as Supabase Edge Functions (`seald`,
> `seal-worker`, `email-worker`) driven by pg_cron, with
> `api.seald.nromomentum.com` served through the Cloudflare Pages worker
> (`seald-landing`). Sealing uses a P12 from function secrets; Drive tokens
> are wrapped with `GDRIVE_TOKEN_WRAP_KEY` (`local:v1`, all rows re-wrapped
> before KMS deletion). Nightly encrypted backups run in
> `backup-supabase.yml`. The EC2 instance, Elastic IP, security groups,
> Secrets Manager secret, KMS keys and IAM resources were deleted and the
> AWS account was closed. The KMS signer, Terraform, Docker/Caddy files
> and the EC2 workflows were removed from the repo (PR #403). For the
> current setup see `docs/self-hosting.md` and `docs/agents/RELEASE.md`.
> Everything below describes the plan as written before the cut-over;
> file and workflow names in it may no longer exist.

## 1. What AWS does today

Postgres and Storage are already on Supabase, and the SPA and landing page
are on Cloudflare Pages (free). AWS hosts only these:

| AWS piece                    | Used for                                                      | Approx. cost |
| ---------------------------- | ------------------------------------------------------------- | ------------ |
| EC2 `t4g.small` + EIP + EBS  | Nest API, in-process workers, Caddy (TLS), Gotenberg sidecar  | ~$15-17/mo   |
| KMS key `sealing-kms`        | Asymmetric key that signs every PAdES seal (`KmsPadesSigner`) | ~$1/mo + ops |
| KMS key `gdrive-token-kms`   | Wraps the per-row DEKs for Google Drive refresh tokens        | ~$1/mo + ops |
| Secrets Manager `api` secret | Runtime env blob loaded by `scripts/entrypoint.sh`            | ~$0.40/mo    |
| IAM role / instance profile  | Lets the EC2 box call KMS and Secrets Manager                 | free         |

Code that touches AWS: `apps/api/src/sealing/kms-cms-signer.ts`,
`pades-signer.ts`, `integrations/gdrive/gdrive-kms.service.ts`,
`scripts/generate-kms-binding-cert.ts`, `deploy/terraform/**`,
`.github/workflows/deploy.yml`, `seed-secrets-manager.yml`, and the AWS CLI in the
`Dockerfile`/`entrypoint.sh`.

## 2. Target architecture (all free tiers)

```
Browser / MCP client / Resend / Google
        │
        ▼
seald.nromomentum.com      ── Cloudflare Pages (already there) ── SPA + landing
api.seald.nromomentum.com  ── same Pages project, _worker.js host branch
        │  (thin proxy, keeps the public API hostname)
        ▼
Supabase Edge Function `api`  (whole Nest app bundled into one function)
        │
        ├── Supabase Postgres (via Supavisor pooler, port 6543)
        ├── Supabase Storage  (bucket `envelopes`)
        ├── Supabase Vault / function secrets (keys, P12, CRON_SECRET)
        └── pg_cron + pg_net ── POST /internal/cron/tick every 30-60 s
```

Everything that runs code is a Supabase Edge Function or a pg_cron job. The
only non-Supabase piece is the Cloudflare proxy, which we already run, and
it exists only because Supabase custom domains are a paid add-on.

## 3. Supabase Free limits that shape the design

Check these against the current pricing page before starting. They change.

- Edge Functions: 500k invocations/mo, **2 s CPU per request** (I/O wait is
  not counted), 150 s wall clock, 256 MB memory, 20 MB bundle.
- Database 500 MB, Storage **1 GB**, 50 MB max file, 5 GB egress/mo.
- **No automated backups** on Free.
- **The project pauses after 7 days of inactivity.**
- 2 active projects per org. The NRO Momentum org already has `flow-pilot`
  on Free, so Seald would use the second slot. Check that the Seald project
  is on a Free org; it was not visible to this session.
- pg_cron, pg_net, Vault and Queues (pgmq) are all on Free.

What this means for the design: one "fat" function (fewer cold starts, one
invocation per request), background work driven by cron ticks, and each
sealing step must fit 2 s of CPU.

## 4. Workstreams

### WS-0 Feasibility spike (do first, 1-2 days, go/no-go)

Bundle the compiled `apps/api/dist` with esbuild into an ESM bundle. Bundling
the tsc output keeps the emitted decorator metadata that Nest DI needs. Serve
it from `supabase/functions/api/index.ts` through an Express adapter. Measure:

1. Bundle size (< 20 MB with `@react-pdf/renderer`, fonts, pdf-lib, forge,
   MCP SDK).
2. Cold start: Nest bootstrap CPU time.
3. CPU time of one full seal: burn-in, CMS sign, audit.pdf render, DSS,
   B-LTA. Use the `verify-pades` fixtures.
4. `pg` over the transaction pooler, multer uploads, `node:crypto` parity.
5. `automations/ssrf/pinned-request.ts`: whether a DNS-pinned `node:http`
   request works in the edge runtime.

If item 3 goes over budget, split sealing into steps, one per cron tick, and
store intermediate bytes in Storage. If it is still over, render `audit.pdf`
with pdf-lib instead of react-pdf. The last-resort plan B is outside
Supabase: Oracle Cloud Always Free ARM VM running the existing
`docker-compose.yml` unchanged, minus KMS.

#### WS-0 results (2026-10-25, local `supabase/edge-runtime:v1.77.8`)

Measured with the runtime's own CPU limits (soft 1 s, hard 2 s, 256 MB),
not on the hosted platform yet.

- **The API runs as one function.** `pnpm --filter api build:edge` bundles
  `dist/` to an 8.99 MB ESM file (minified) plus 1.47 MB of embedded
  templates, fonts and locales. `/health` answers 200; warm requests take
  3-8 ms.
- **Runtime rules found on the way, all handled in the edge entry:**
  Node built-ins need the `node:` prefix; `Buffer`/`process`/`global` are
  not globals for local modules; `Deno.env.set` is not allowed; synchronous
  file APIs only work while the entry module is still evaluating, so the
  bundled assets are served from memory by `supabase/functions/seald/asset-fs.ts`;
  Nest's `abortOnError` must be off or a boot error leaves a half-built app.
- **CPU is counted per worker, not per request.** Past the soft limit the
  worker is retired after its current request; past the hard limit it is
  killed mid-request. So a worker's budget includes its own boot.
- **Cold start: 0.7-1.0 s CPU** (most of it parsing the 9 MB bundle; Nest
  boot is about 0.17 s).
- **Sealing does not fit as one job.** The first seal on a worker costs
  about 1.2-2.0 s CPU; a warm one about 0.6-1.0 s. Boot plus a first seal
  is over the 2 s hard limit. The biggest costs were forge's pure-JS RSA
  (now native `node:crypto`, byte-identical output) and react-pdf's font
  shaping and stream compression for `audit.pdf`.
- **Next:** split sealing so the PAdES seal and the `audit.pdf` render run
  as separate jobs (each on its own invocation), shrink the bundle that
  sealing loads, and confirm the hosted platform's limits with one real
  deploy before the cut-over.
- **Done since (2026-10-25):** the target is now the Supabase-native design
  in `docs/supabase-native-architecture.md`. Sealing runs step-wise on its
  own `seal-worker` function (5.3 MB bundle, 0.4-0.5 s boot). Against the
  local Supabase stack with the 1 s/2 s limits, every step costs under
  about 0.85 s, a 3-document envelope (30 pages each) seals in about 8 s
  through self-kicks with no worker killed, and `verify-pades` passes on
  every output (B-T, B-LT, B-LTA).
- `sharp` is replaced by a pure-JS PNG/JPEG normalizer (WS-5 done).

### WS-1 Secrets: Secrets Manager → Supabase function secrets

- `supabase secrets set --env-file` from the current blob. Remove
  `SEALD_API_SECRET_ID`, the AWS CLI and jq from `Dockerfile` and
  `entrypoint.sh`, and `seed-secrets-manager.yml`.
- `CRON_SECRET` also goes into Vault so the pg_cron SQL can read it.

### WS-2 Sealing key: AWS KMS → P12 held in function secrets

- Use the existing `P12PadesSigner` (`PDF_SIGNING_PROVIDER=local`). Add a
  `PDF_SIGNING_P12_BASE64` + `PDF_SIGNING_P12_PASSWORD` input, because the
  edge runtime has no filesystem path to mount. S.1 still holds: misconfig
  throws at startup, no silent Noop.
- Generate a new RSA key and self-issued cert. The KMS key cannot be
  exported, so the KMS binding cert is retired. Envelopes already sealed
  stay valid: each one embeds its own cert, DSS and B-LTA timestamp.
- TSA stays `freetsa.org`, plus a second free TSA in `PDF_SIGNING_TSA_URLS`
  (e.g. `http://timestamp.digicert.com`).
- **Trade-off:** the key is no longer held in a non-extractable HSM.
  Anyone with project-owner access can read it. Accept this for the
  free tier and record it in `docs/self-hosting.md` at the cut-over. F-15
  (HSM rotation runbook) is moot until a paid tier returns.
- Delete `KmsCmsSigner`/`KmsPadesSigner` and `@aws-sdk/client-kms` only after
  the cut-over is proven. Until then keep them as dead code behind
  `PDF_SIGNING_PROVIDER=kms` so rollback is a config change.
- Update CLAUDE.md S.1-S.3 and `memory/project_kms_signer.md`.

### WS-3 Drive token encryption: KMS → local wrap key

- `GDriveKmsService` already depends on a small KMS port. Add
  `LocalWrapKmsClient`: `GenerateDataKey` returns 32 random bytes, wrapped
  with AES-256-GCM under `GDRIVE_TOKEN_WRAP_KEY` (64 hex). It follows the
  same pattern as `AUTOMATION_SECRETS_KEY`.
- One-off script, run while AWS credentials still work: decrypt each
  `gdrive_accounts` row with KMS and re-wrap it with the local key. Mark the
  rows with a new `kms_key_arn` value such as `local:v1`, so the code can
  tell old rows from new. If we skip this step, users reconnect Drive.
- Status: `LocalWrapKmsClient` and the dual read are in. With
  `GDRIVE_TOKEN_WRAP_KEY` set, new rows are stamped `local:v1`; rows still
  stamped with the KMS ARN decrypt through KMS while both are configured.
  The re-wrap script is still to do. Same trade-off as WS-2: the wrap key
  lives in the function secrets.

### WS-4 Workers: in-process loops → pg_cron ticks

- Today seven services poll in-process: email, reminders, sealing,
  seal-sweep, step-sweep, bulk, automations. Edge functions have no
  long-lived process, so set `WORKER_ENABLED=false`.
- Add `POST /internal/cron/tick` (`X-Cron-Secret`). It runs one bounded drain
  of each worker with a ~100 s wall budget and N jobs each. The jobs table
  already claims with `FOR UPDATE SKIP LOCKED`, so overlapping ticks are
  safe. Keep the existing `expire`, `reminders` and sweep endpoints.
- pg_cron: `cron.schedule('seald-tick', '30 seconds', $$ select net.http_post(...) $$)`
  ≈ 88k invocations/mo. The migration needs a paired down (M.3).
- For latency: after enqueueing a seal or email, start that one job with
  `EdgeRuntime.waitUntil(...)` so the common path doesn't wait for a tick.
- Bulk send: `BULK_SEND_ROWS_PER_MINUTE` now caps rows per tick.

### WS-5 Native or sidecar dependencies

- **Gotenberg (.docx → PDF from Drive)**: remove the sidecar. Replace it
  with Drive-native conversion: `files.copy` to
  `application/vnd.google-apps.document`, `files.export` as PDF, then
  delete the copy. Confirm in the spike that this works under the
  `drive.file` scope. If it does not, **drop .docx** and show "Save as PDF
  in Drive first". Google Docs and PDF picks are unaffected.
- **sharp (signature image normalization in `signing.service.ts`)**: it
  can't run in the edge runtime. Re-encode the image to PNG in the browser
  (canvas). On the server, validate and decode with a pure-JS decoder
  (`pngjs`/`jpeg-js`) and enforce the same size and dimension caps.

### WS-6 Domain and proxy

- Add `api.seald.nromomentum.com` as a second custom domain on the
  `seald-landing` Pages project (CNAME, same as the apex today). In
  `apps/landing/_worker.js`, branch on host: `api.*` proxies to
  `https://<ref>.supabase.co/functions/v1/api/*`.
- This keeps the API URL unchanged, so none of these need edits:
  `VITE_API_BASE_URL`, `GDRIVE_OAUTH_REDIRECT_URI`, Resend webhook,
  `MCP_OAUTH_ISSUER`, existing MCP client configs, links in sent emails.
- Deploy the function with `--no-verify-jwt`. The app does its own
  Supabase-JWT, API-key and signer-session auth.
- **Signer IP in the audit trail**: forward `CF-Connecting-IP` and trust it
  only from the proxy (shared header secret). Without this, every signer
  shows a Cloudflare or Supabase IP. That breaks evidence quality and the
  throttler.
- Watch the Pages Functions free quota (100k req/day). The worker now sees
  API and SPA traffic.

### WS-7 Deploy pipeline and migrations

- `deploy.yml` (SSH to EC2) becomes `supabase functions deploy api`
  from GitHub Actions. Retire `docker.yml`, `restart-gotenberg.yml`,
  `inspect-prod-containers.yml`, `prod-diagnose.yml`, `prod-restore.yml`,
  `set-*-env.yml`, and Caddy.
- Migrations: run `apps/api/scripts/migrate.sh` as a CI step against
  `DATABASE_URL` before the function deploy, because no container boots any
  more. M.1-M.4 are unchanged.
- Terraform: keep `godaddy.tf` (DNS). Remove the AWS provider and modules
  after decommission.

### WS-8 Free-tier guardrails

- **Backups**: Free has none, and this is legal evidence. Add a nightly
  GitHub Action: `pg_dump` plus a Storage bucket sync, encrypted with `age`,
  pushed to free off-site storage (Cloudflare R2 has 10 GB free, or Google
  Drive). Test a restore once.
- **Pausing**: the 30 s cron tick plus real traffic should count as
  activity. Add a daily GitHub Actions health ping to `/health` as a
  backstop, and alert if it fails.
- **Storage 1 GB** is the real ceiling. Each envelope keeps the original,
  sealed and audit PDF (~3× the upload). Add a usage check to the nightly
  job and warn at 70%. Purge `mcp_uploads` and staged uploads aggressively;
  sweeps for those already exist.
- Email stays on Resend free; the quota guard already exists.

## 5. What we give up

| Item                          | Outcome                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| HSM-backed sealing key        | Software key in secrets (security downgrade, documented)                                        |
| .docx import from Drive       | Kept if Drive-native conversion works, else dropped                                             |
| Instant background work       | Common path still instant via `waitUntil`; retries ≤ 30-60 s                                    |
| Automation webhook IP pinning | Kept if spike item 5 passes, else resolve-then-check or turn `workflowAutomations` webhooks off |
| Daily managed DB backups      | Replaced by our own nightly encrypted dump                                                      |
| Large files                   | 50 MB Storage cap (25 MB Drive cap already lower)                                               |

## 6. Cut-over sequence

1. Merge WS-1 to WS-5 behind config. The EC2 deploy keeps working
   throughout.
2. Run the WS-3 re-wrap script (needs AWS creds) and verify a Drive import.
3. Deploy the edge function. Smoke-test it on the raw `supabase.co` URL:
   sign in, create, sign, seal, check `verify-pades` on the output,
   `/verify/:id` with `chain_intact`, MCP call, Resend webhook.
4. Short window: stop the EC2 workers, enable the pg_cron tick, flip
   `_worker.js` to proxy `api.*` to Supabase, then remove the GoDaddy A
   record for `api` in favour of the Pages CNAME.
5. Watch for 48 h: function logs, cron run history, quota usage.
6. Rollback during the first 2 weeks: point DNS back at the EIP and start
   the stopped EC2 instance. Do not terminate it before then.
7. Decommission: terminate EC2 and release the EIP, delete the Secrets
   Manager secret, schedule deletion of both KMS keys (30-day window;
   past seals don't need them), remove the AWS Terraform and the AWS SDK.

## 7. Effort

Spike 1-2 days. WS-1 to WS-7 about 1.5-2.5 weeks for one developer,
mostly WS-4 (worker refactor) and WS-5 (sharp, Gotenberg). WS-8 is about a
day. Saving: about $18-20/month of AWS spend, down to $0.
