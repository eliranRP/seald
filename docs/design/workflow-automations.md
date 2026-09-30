# Workflow automations for Seald — technical design

**Status:** proposal. This document does not change the product.
**Date:** 2026-09-30
**Audience:** API and web implementers.
**Companion:** [MCP server](./mcp-server.md)

A sender picks a short recipe, fills in a folder or a URL or an address list, and Seald runs it when an envelope event happens. The recipes are the product. A free-form workflow builder is not.

## Summary

Store recipes in `automations`. The event transaction writes one pending `automation_triggers` row. Matching into `automation_jobs` and `automation_runs` runs after commit. A worker in the same process as `EmailWorkerService` claims the job with `for update skip locked`, performs one action, and retries with backoff. Actions: POST a JSON webhook, upload the sealed PDF and the audit trail to a Google Drive folder the user already picked, or email a copy to a list. Slack is named and not built.

The feature is dark until `workflowAutomations` is `true` in `packages/shared/src/feature-flags.ts`. While it is false, routes return 404 and the settings index row is omitted. `AUTOMATIONS_DISABLED=true` does the same at request time, without a rebuild. There is no new `NAV_ITEMS` entry.

## Non-goals

- A graph editor, branching, delays, or user-defined code.
- Signing, or placing signing tokens in any outbound payload.
- A new queue service, Redis, or a second host. The free Supabase Postgres plan and the existing API process are the budget.
- A new Google OAuth scope. Uploads use the connected `drive.file` account and `GdriveExportService`.
- Replacing the mail the product already sends (`invite`, `reminder`, `signed_to_sender`, `completed`, decline, expiry, withdrawal). Recipes add a sender-configured action on top of those.
- A change to how PDFs are stored. Drive and email actions read the objects the sealer already wrote.
- Calling the signature advanced, qualified, or equivalent to a handwritten signature. `packages/shared/src/product-claims.ts` (`SIGNATURE_LEVEL_NOTE`) stays the description.

## What exists today

Events already exist. There is no bus.

| Event the recipe cares about | `event_type` today | Written by |
| --- | --- | --- |
| Document sent | `sent` | `EnvelopesService.send`, one row per signer, `actor_kind: system` |
| Document viewed | `viewed` | `SigningService` |
| A signer signed | `signed` | `SigningService` after `POST /sign/submit`. Also enqueues `signed_to_sender` when the sender is someone else (`dedupe_key` `signed_to_sender:<envelope>:<signer>`, migration `0019_email_signed_to_sender.sql`). |
| Document completed | `sealed` | `SealingService`, after the sealed PDF and the audit PDF exist. `all_signed` fires earlier, before artifacts exist, so Drive and “email the finished file” wait for `sealed`. |
| Declined | `declined` | `SigningService`. `declined_to_sender` is already queued. |
| Expired | `expired` | `CronController.expire` (`POST /internal/cron/expire`), then an `audit_only` job. |

Other event types (`created`, `field_filled`, `reminder_sent`, …) do not trigger recipes in v1.

The outbox pattern to copy:

1. A service inserts a row (`outbound_emails` or `envelope_jobs`).
2. A worker claims it. Email: `OutboundEmailsRepository.claimNext` uses `for update skip locked`, sets `sending`, increments `attempts`. Seal jobs: `EnvelopesRepositoryPg.claimNextJob` does the same.
3. Success marks the row done. Failure uses backoff. Email: `backoffMs` in `email-dispatcher.service.ts` (2 minutes, doubling, cap 6 hours, `max_attempts` 8). Jobs: `failJob` (2^attempts minutes, cap 10 minutes, `max_attempts` 5).
4. `EmailWorkerService` and sealing `WorkerService` both loop only when `WORKER_ENABLED` is true. `POST /internal/cron/flush-emails` is the manual kick. Caddy answers `/internal/*` with 404 on the public edge (`deploy/Caddyfile`), so cron stays on loopback with `X-Cron-Secret`.

`envelope_jobs` cannot hold automation work. The table is unique on `envelope_id`, and `kind` is only `seal` | `audit_only`.

`idempotency_records` is not the run log. Email dedupe for sender notices is `outbound_emails.dedupe_key` (`insertOutboundEmailIdempotent`).

Drive save already does the upload half of the Drive recipe: `EnvelopesService.saveToGoogleDrive` → `GdriveExportService.exportEnvelope`. It picks the most recently used connected account, refreshes the access token, downloads sealed and audit bytes from Storage, and creates or updates Drive files. Bookkeeping is `gdrive_envelope_exports` (unique on envelope + account, migration `0017`). Partial failure returns both file ids and an error (HTTP 207 on the controller). Token revocation is `TokenExpiredError`. Rate limit is `GDriveRateLimiter`. Scope is `drive.file` only.

RLS is enabled on application tables. Most have no policies; the API role bypasses RLS. `gdrive_envelope_exports` is the exception with an owner policy (`0017`). New automation tables follow the no-policy pattern used by `envelopes` and `outbound_emails`, so the browser cannot read them through PostgREST. The SPA talks to the API.

Last migration on `main` is `0019_email_signed_to_sender.sql`. Open PR #367 already uses `0020_envelope_reminders.sql`. This feature takes the next free id at merge time. Paired down scripts are required. On Postgres 17, `ALTER TYPE … ADD VALUE` is allowed inside the transaction `migrate.sh` opens.

`AppShell` sends ≤640px viewports to `/m/send`. Phone UI for recipes lives outside the shell. `/settings/` and `/m/` are already SPA prefixes in `apps/landing/_worker.js`.

## Shared foundations

`appendEvent` (`envelopes.repository.pg.ts`, around line 1349) inserts the envelope event and one `automation_triggers` row in the same transaction. The trigger row stores the event id and `status = 'pending'`. It does not look up recipes, and it does not insert `automation_runs` or `automation_jobs`.

Matching runs after that transaction commits. The worker claims pending triggers, loads the envelope, selects enabled recipes, and inserts the run and the job. It then sets the trigger to `matched`. A matcher exception is logged. The trigger stays `pending`. The signer’s submit and the sealing step have already committed, so a matcher bug does not fail either one.

A checkpoint row stores `(created_at, id)`, not the uuid alone. `envelope_events.id` is a random uuid, so “after that id” is not an order. On startup the worker rescans from five minutes before the checkpoint. The partial index on `automation_triggers` where `status = 'pending'` can also find every pending row, so the checkpoint is an optimization, not a correctness requirement. A missed checkpoint still matches. The overlap is safe because the unique run key makes a second match a no-op. Matching runs after commit. It does not run inside the signer’s transaction, so a matcher bug cannot fail submit or sealing. A SAVEPOINT inside `appendEvent` is the other acceptable shape. This design uses after-commit. There is no path where a matcher error rolls the event back.

The match only inserts rows. It does not call the network. Keep that function small and covered by the repository test.

Account-deletion inserts of `retention_deleted` do not go through `appendEvent`. They are not triggers.

MCP tools that create envelopes call the existing services, which call `appendEvent`, which writes the trigger row. Agents do not get a side door that skips recipes. Read tools do not wait for the matcher. The hook is A1 on this track, not an MCP step.

MCP tools over recipes are their own PRs after the webhook action exists. They call this feature’s service. They do not return webhook signing secrets after create. Owner approval applies only to changes an agent makes through MCP. Creating or editing a recipe that adds an external destination — a webhook URL, an email address that is not the owner’s mailbox, or a Drive folder — returns `approval_pending` and stays disabled until the owner approves. Approval is email-first: a link to the standalone Approve/Deny page, with the in-app queue as secondary. A signed-in Save in the app does not wait: the flow is recipe, then Save, then on. An external destination sends the owner a short notification email. It is not an approval. `POST /automations/:id/test` and `automations_test_webhook` return `recipe_not_approved` and do not call the network while an MCP recipe is still waiting on approval. A recipe the owner saved in the app can be tested.

## Recipes

The user picks one of these. The form asks only for the blanks.

| Recipe id | Trigger label | `event_type` | Action | Blanks |
| --- | --- | --- | --- | --- |
| `sealed_save_drive` | When the document is sealed | `sealed` | `gdrive_upload` | Drive folder (picker) |
| `sealed_webhook` | When the document is sealed | `sealed` | `webhook` | HTTPS URL |
| `declined_notify_me` | When someone declines | `declined` | `email_copy` | Defaults to the sender’s mailbox. Optional extra addresses. |
| `signed_notify_list` | When someone signs | `signed` | `email_copy` | Address list. This is in addition to `signed_to_sender`. |
| `completed_email_copy` | When the document is sealed | `sealed` | `email_copy` | Address list. This is in addition to the `completed` mail signers already get. |
| `viewed_notify_me` | When someone first views | `viewed` | `email_copy` | Sender mailbox. |
| `sent_webhook` | When the document is sent | `sent` | `webhook` | HTTPS URL |
| `expired_notify_me` | When the request expires | `expired` | `email_copy` | Sender mailbox. |

`sent` fires once per signer. A `sent_webhook` recipe runs once per `sent` event. The payload’s `signer` object tells the receiver which invitation went out. That note sits behind Advanced. The main form does not explain it.

Scope is the whole account, or one template.

- Account: `scope = account`, `template_id` null. The recipe runs for every envelope that owner sends.
- Template: `scope = template`, `template_id` set. The recipe runs only when the envelope was created from that template.

Template scope needs the envelope to remember the template. Add nullable `envelopes.source_template_id uuid references templates(id) on delete set null` in the automations migration. `templates_use` (HTTP and, later, MCP) sets it when it applies a template. Envelopes that never used a template do not match template-scoped recipes. Deleting a template sets the column to null and cascades the recipe row (`on delete cascade` from `automations.template_id`), so a deleted template does not leave a live recipe.

One owner may save at most 10 recipes (free-plan cap below). A recipe is one trigger and one action. “When sealed, save to Drive and call a webhook” is two recipes. That is deliberate.

Slack is not a recipe yet. The action enum includes `slack` so a later migration does not rewrite the type. The worker, if it ever sees that action, finishes the run as `failed` with `retryable` false and slug `action_not_available`, and does not call the network. The UI does not offer it.

## Data model

Migration: next free id, not `0020` (PR #367). Down script drops the new tables and the new enum types, and drops `envelopes.source_template_id` if this migration added it. The `recipe` column stores the ids below. Do not ship a `signed_` id for a recipe that fires on `sealed`. `signed_notify_list` stays, because it fires on per-signer `signed`.

```sql
create type automation_scope as enum ('account', 'template');

create type automation_trigger as enum (
  'envelope_sealed',
  'signer_signed',
  'signer_declined',
  'envelope_expired',
  'envelope_viewed',
  'envelope_sent'
);

create type automation_action as enum (
  'webhook',
  'gdrive_upload',
  'email_copy',
  'slack'
);

create type automation_run_status as enum (
  'queued',
  'running',
  'done',
  'retrying',
  'failed'
);

create table public.automations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  recipe        text not null,
  name          text not null check (char_length(name) between 1 and 80),
  enabled       boolean not null default true,
  trigger       automation_trigger not null,
  action        automation_action not null,
  scope         automation_scope not null default 'account',
  template_id   uuid references public.templates(id) on delete cascade,
  config        jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint automations_scope_template_chk check (
    (scope = 'account' and template_id is null)
    or (scope = 'template' and template_id is not null)
  )
);

create table public.automation_secrets (
  automation_id          uuid primary key references public.automations(id) on delete cascade,
  secret_ciphertext      bytea not null,
  secret_nonce           bytea not null,
  previous_ciphertext    bytea,
  previous_nonce         bytea,
  previous_retired_at    timestamptz,
  created_at             timestamptz not null default now()
);

create table public.automation_triggers (
  event_id    uuid primary key references public.envelope_events(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'matched')),
  created_at  timestamptz not null default now(),
  matched_at  timestamptz
);

create table public.automation_jobs (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null unique,
  automation_id  uuid not null references public.automations(id) on delete cascade,
  status         text not null default 'pending',
  attempts       integer not null default 0,
  max_attempts   integer not null default 8,
  scheduled_for  timestamptz not null default now(),
  locked_at      timestamptz,
  created_at     timestamptz not null default now()
);

create table public.automation_runs (
  id               uuid primary key default gen_random_uuid(),
  automation_id    uuid not null references public.automations(id) on delete cascade,
  owner_id         uuid not null references auth.users(id) on delete cascade,
  envelope_id      uuid references public.envelopes(id) on delete set null,
  event_id         uuid references public.envelope_events(id) on delete set null,
  signer_id        uuid,
  trigger          automation_trigger not null,
  action           automation_action not null,
  status           automation_run_status not null default 'queued',
  retryable        boolean not null default true,
  attempts         integer not null default 0,
  last_error       text,
  response_status  integer,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
```

`automation_jobs.run_id` references `automation_runs(id)` with `on delete cascade`. Add that foreign key in the same migration after both tables exist.

`config` shape by action:

| Action | `config` |
| --- | --- |
| `webhook` | `{ "payload_detail": "ids", "url_host": "hooks.example.com" }` `payload_detail` is `ids` (default) or `with_signer`. `url_host` is the hostname only. The URL and the signing secret are not in `config`. |
| `gdrive_upload` | `{ "folder_id": "string", "folder_name": "string|null", "account_id": "uuid|null" }` `account_id` null means the same most-recently-used account `GdriveExportService` already picks. |
| `email_copy` | `{ "to": ["email", …] }` Max 10 addresses. |
| `slack` | Unused. |

Webhook secrets are recoverable, because the worker has to compute HMAC. API keys in the MCP design are the opposite: those are stored as a SHA-256 hash and cannot be read back. Automation secrets are encrypted in the application with a 32-byte key from `AUTOMATION_SECRETS_KEY`, AES-GCM, with AAD set to `automation_id`. The row stores a nonce and the ciphertext. There is no call to a remote key service and no per-request charge. If the env var is unset, creating a webhook recipe returns 503 `automation_secrets_not_configured`. Do not store the secret in plaintext `config`, and do not reuse the Drive token path. Document bytes stay on the storage path they use today.

The webhook URL is secret configuration. It may contain credentials in the path or the query. Create and update accept the URL, encrypt it with the same `AUTOMATION_SECRETS_KEY` on the secret row, and do not write it to `config`, logs, run history, or a later GET. Responses show `url_host` only. Do not echo the URL. Do not log it.

Screens, emails, and toasts say “Secret set” and the rotation date. They do not mention keys, algorithms, or ciphertext.

RLS: `enable row level security` on all five tables, no policies.

Indexes: `(owner_id, enabled)` on `automations`; `(scheduled_for)` on `automation_jobs` where `status = 'pending'`; `(status)` on `automation_triggers` where `status = 'pending'`; `(owner_id, created_at desc)` on `automation_runs`. Unique index `automation_runs_dedupe_idx` on `(automation_id, envelope_id, trigger, coalesce(signer_id, '00000000-0000-0000-0000-000000000000'::uuid))`.

`automation_triggers` retention: the matcher sets `status = 'matched'` and `matched_at`, inserts the run, then deletes that trigger row in the same transaction. The run is the history. A daily pass deletes any `matched` row whose `matched_at` is older than 24 hours, in case that delete was skipped. Pending rows stay until they match or the envelope event is deleted. Because the partial index finds every pending row, the checkpoint only limits how far a scan looks. It is not required for correctness.

`updated_at` uses the existing `set_updated_at` trigger pattern from `envelopes`.

Account deletion: `owner_id` cascades. `MeService` does not need a special case beyond what `on delete cascade` removes. Confirm in the account-deletion test that recipes, secrets, jobs, and runs go away with the user. Trigger rows follow the event. Envelope events on preserved sealed envelopes (`0012_preserve_envelopes_on_user_delete.sql`) can outlive the owner; `automation_runs.owner_id` still cascades with the user, so history is deleted with the account. That is acceptable: the audit chain on the envelope remains, the recipe log does not.

## Execution

```
appendEvent transaction
  → insert envelope_events
  → insert automation_triggers (event id, pending)
  → commit
matcher, after commit (and again on startup rescan)
  → match pending triggers into automation_runs and automation_jobs
  → mark the trigger matched, then delete that row (retention; a daily pass removes any matched row older than 24 hours)
AutomationWorkerService  (WORKER_ENABLED, same process)
  → claim job (skip locked)
  → run the action
  → mark run done, or retrying with scheduled_for, or failed
```

A matcher failure is logged and leaves the trigger `pending`. The signer’s submit and sealing stay committed. The startup rescan finishes the match. Unique run keys make that second match a no-op.

Matcher rules, which run after commit on a pending trigger and do not run inside the event transaction:

1. Load the envelope by id. If `owner_id` is null (preserved envelope after account deletion), stop.
2. Map `event_type` to `automation_trigger`. Unmapped types stop.
3. Select enabled recipes for that owner where the trigger matches, and either `scope = account` or `template_id = envelope.source_template_id`.
4. Insert the run. The unique key is `(automation_id, envelope_id, trigger, coalesce(signer_id, '00000000-0000-0000-0000-000000000000'::uuid))`. A duplicate event for the same signer and trigger is a no-op. Two signers on one envelope still produce two `signed` runs.
5. Insert the job only when the run insert returned a row.

The matcher runs after commit. It does not perform HTTP, Drive, or email. A matcher error is logged and does not fail the signer’s submit or sealing.

Worker, `apps/api/src/automations/automation-worker.service.ts`, copied in structure from `EmailWorkerService`:

- `onModuleInit` starts the loop when `WORKER_ENABLED` is true and the flag is on.
- Claim batch of 1, so a stuck action cannot pile up inside one tick. In-flight cap is 2 for the process.
- Claim SQL mirrors `claimNext` on `outbound_emails`: pick a job in `pending` with `scheduled_for <= now()` and `attempts < max_attempts`, `for update skip locked`, set status `running`, set `locked_at = now()`, increment `attempts`. A job left `running` with `locked_at` older than 15 minutes is claimed again. The run status `retrying` is what the history UI shows between attempts.
- On success: set the run to `done` and delete the job. The run remains.
- On a transient failure: set the run to `retrying`, set `last_error` to the slug or status code only, set the job back to `pending`, and set `scheduled_for`. Backoff matches email: `backoffMs` (2, 4, 8, … minutes, cap 6 hours). `max_attempts` 8. `last_error` never stores an upstream body, a signer name, an email address, or the webhook URL.
- On a permanent failure (4xx other than 408 and 429, SSRF rejection, missing Drive connection, bad config): set the run to `failed`, set `retryable` false, delete the job. The UI shows Fix, which opens the recipe. There is no Retry button.
- After `max_attempts` on a temporary failure (timeout, DNS, 408, 429, 5xx): set the run to `failed`, set `retryable` true, delete the job. The UI shows one-tap Retry. The failed run stays until Retry succeeds, the owner edits the recipe, or the owner deletes it. It is not deleted at 30 days.
- `POST /automations/:id/runs/:runId/retry` inserts a new job for that same run id. The unique `run_id` on `automation_jobs` makes a second tap a no-op while a job exists. A permanent failure returns `retry_not_allowed` and does not insert a job. The MCP tool `automations_retry_run` calls this same method.
- Twenty consecutive `failed` runs on one recipe set `enabled = false` and email the owner. Queued jobs already claimed still finish.
- Idle sleep 5 seconds, error sleep 10 seconds, same as the email worker.

`POST /internal/cron/flush-automations` calls the same `flushOnce(10)` the worker uses, with `X-Cron-Secret` and `CronController`’s constant-time compare. Caddy already hides `/internal/*`. This is the manual kick, not the steady-state path.

Disable and delete: `enabled = false` stops new jobs. Jobs already queued still finish. Deleting a recipe cascades jobs and runs.

`viewed` is written once, on the first open. `SigningService` appends it only when `viewed_at` is null (`signing.service.ts` around line 223). The recipe card says “When someone first views”. A later open does not append another event.

## Webhook security

Action `webhook`. One URL, HTTPS, port 443.

### Signature

Headers on every attempt. During the 24 hour rotation window the worker sends both:

```
Seald-Signature: t=<unix seconds>,v1=<hex hmac of the current secret>
Seald-Signature-Previous: t=<unix seconds>,v1=<hex hmac of the previous secret>
Seald-Event-Id: <automation_runs.id>
```

`Seald-Event-Id` is stable across a reclaim, so a receiver can dedupe if the first attempt is still in flight.

After `previous_retired_at`, only `Seald-Signature` is sent. String to sign: `` `${t}.${rawBody}` ``, HMAC-SHA256, hex. The verify snippet accepts `t` within 300 seconds and compares with `crypto.timingSafeEqual` over equal-length buffers. A length mismatch fails closed before the compare.

Replay: a captured request fails the timestamp window. A retry from Seald is a new timestamp and a new signature over the same body `id` (the run id). Receivers dedupe on `id`, not on `t`.

Rotation: settings action “Rotate secret” generates a new secret, moves the current ciphertext into `previous_*`, sets `previous_retired_at` to now plus 24 hours, shows the new secret once. After `previous_retired_at`, a daily pass in the worker clears `previous_ciphertext`. The old secret stops verifying.

The secret is shown once, the same interaction as an MCP API key. The list view shows “secret set” and the rotation date, not the secret.

### SSRF

Before every attempt, including retries:

- Scheme `https` only. Reject userinfo. Port 443 only.
- Resolve the hostname. Fail `failed` / `webhook_url_blocked` if any address is loopback, unspecified (`0.0.0.0/8`), link-local (`169.254.0.0/16`, `fe80::/10`), private (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`), `192.0.0.0/24`, CGNAT (`100.64/10`), multicast (`224.0.0.0/4`), benchmarking (`198.18.0.0/15`), reserved (`240.0.0.0/4`), IPv6 documentation (`2001:db8::/32`), or NAT64 (`64:ff9b::/96`), the broadcast address `255.255.255.255`, or Teredo `2001::/32`. Check IPv4-mapped IPv6 (`::ffff:0:0/96`) against the embedded IPv4 address. Block 6to4 `2002::/16` when the embedded address is private or otherwise on this list. Also block the instance metadata hostnames, the IPv6 metadata address, and Seald’s own API, app, and Supabase hostnames.
- Connect with an undici agent pinned to the resolved address that passed the check. SNI and `Host` stay the original hostname. `redirect: 'manual'`. A 3xx is `failed` / `webhook_redirect_blocked`. There is no redirect follow.
- Timeout 10 seconds. Read at most 64 KB, then discard. Store only the status code.
- DNS failure and connection timeout are transient. A blocklist hit is permanent.
- Production notes, in the same PR as the webhook worker: instance metadata hop limit 1, so a confused request cannot reach a second hop. No customer proxy.

Do not send the request through a customer-supplied proxy.

### Payload

`Content-Type: application/json`. Version field `seald.automation.v1`.

```json
{
  "version": "seald.automation.v1",
  "id": "<automation_runs.id>",
  "type": "envelope.sealed",
  "created_at": "<event created_at>",
  "data": {
    "envelope_id": "uuid",
    "title": "string",
    "status": "completed",
    "short_code": "string",
    "verify_url": "https://<app host>/verify/<short_code>",
    "signer": { "id": "uuid", "name": "string", "email": "string" }
  }
}
```

`type` is `envelope.sealed`, `envelope.sent`, `signer.signed`, `signer.declined`, `envelope.expired`, or `envelope.viewed`.

Default `config.payload_detail` is `ids`. The `data` object is then `envelope_id`, `status`, and `verify_url` only. `with_signer` adds `title`, `short_code`, and `signer` (`id`, `name`, `email`) and is an explicit choice behind Advanced. The line that those fields leave Seald sits behind Advanced too. The main form does not show it. `signer` is omitted when the event has no `signer_id`. Switching `payload_detail` from `ids` to `with_signer` through MCP returns `approval_pending` and stays off until the owner approves. A signed-in Save in the app still turns the recipe on and sends the short notification email.

The example JSON above is the `with_signer` shape. Tests cover both shapes.

The webhook URL is not in the payload, the run row, or the logs. See the secret-configuration rule above.

Left out on purpose:

- Signing tokens, `sign_url`, `access_token_hash`, the `seald_sign` cookie, and anything from `outbound_emails.payload`.
- Storage paths and short-lived download URLs. A signed storage URL in a webhook would land in the receiver’s logs. The owner downloads through the app, or uses the Drive recipe.
- PDF bytes.
- The webhook secret, API keys, or Drive tokens.

A later version increments `version` and keeps sending `v1` until the recipe is edited to opt in. v1 receivers ignore unknown fields.

`User-Agent: Seald-Automations`.

## Drive upload

Recipe `sealed_save_drive`, trigger `envelope_sealed` only. The sealed and audit objects exist at that point (`SealingService` writes them before the `sealed` event).

The default folder is “My Drive / Seald”. Creating the recipe does not ask the user to pick a folder. On the first run the worker creates a folder named Seald in My Drive if that folder id is not stored yet. The app creates it, so `drive.file` can write it, and the recipe stores the new `folder_id`. “Advanced” opens the existing Google Picker (`GET /integrations/gdrive/picker-credentials`, folder mode) for a different folder. A hand-typed folder id is not accepted. A picker folder the app cannot write fails the run as `failed` / `permission-denied`, and the row shows Fix.

Execution calls `GdriveExportService.exportEnvelope` with the envelope’s sealed and audit storage paths and the recipe’s `folder_id` / `folder_name`. The service:

- Refreshes the access token (`GDriveService.getAccessToken`). `TokenExpiredError` → run `failed`, `retryable` false, slug `reconnect_required`. The history row shows Fix.
- No connected account → `failed`, `retryable` false, slug `gdrive_not_connected`.
- `RateLimitedError` → transient, honor `retryAfterMs` as `scheduled_for` if it is later than the normal backoff.
- Updates files in place when `gdrive_envelope_exports` already has ids for that envelope, account, and folder (`0017`). A retry after a partial upload continues from those ids.
- Partial success (sealed stored, audit failed) → run `retrying` if attempts remain, `last_error` set to the artifact slug. The export row already keeps the successful file id.
- Both files stored → run `done`.

The worker uses the recipe’s `account_id` when set. Otherwise it uses the export service’s current rule (most recently used non-deleted account). `gdriveMultiAccount` stays off; the form does not ask the user to pick an account until that flag is on.

Failure copy in the run history is the slug, not the upstream body. Same rule as `mapGdriveSaveError`: do not store Google’s raw error text if it might contain a token. `GdriveExportService` already avoids putting token material in its result.

## Email copy

Action `email_copy` inserts `outbound_emails` through `insertOutboundEmailIdempotent`.

New `email_kind` value `automation_copy`, added with `alter type … add value` in this feature’s migration (same pattern as `0019`). A new value cannot run inside a transaction in older Postgres; follow whatever `0019` did (`add value if not exists` outside an explicit transaction block). Down migrations cannot remove an enum value safely; the down script documents that the value remains, matching the caution needed for `signed_to_sender`.

Template files under `apps/api/src/email/templates/automation_copy/`, registered in `TemplateService` and in `TEMPLATE_KINDS` inside `email-dispatcher.service.ts`. Subject and body state that the sender asked Seald to forward a notice. Include title, status, signer name when present, and a verify URL. Include a link to the envelope in the app (`/document/<id>`) only when the recipient is the owner’s own mailbox. Do not include a signing link, an attachment, or a download URL.

The footer is:

```
You're receiving this because {{sender_email}} added you to a Seald automation.
Stop these notices → {{stop_url}}
{{legal_entity}} · {{legal_postal}}
```

Add `automation_copy` to `legal-footer.contract.spec.ts`. The stop link removes only that address from that owner’s recipes. It does not turn the whole recipe off. It is a single-use token stored as a hash, and it does not carry a signing token.

`TEMPLATE_KINDS` also gains `approval_request` and `approval_denied` in the approvals pull request (see the MCP doc). Those templates use the same 560px shell. The approval mail shows that the decision came from the owner’s verified mailbox. It is not an `automation_copy`. Recipe mail does not reuse them. The stop link on `automation_copy` is not an approval token.

`dedupe_key`: `automation_copy:<run_id>:<email>`. A worker retry that inserts again hits the unique index and `insertOutboundEmailIdempotent` treats that as success.

The run is `done` once the outbox rows are inserted, not when Resend accepts them. Delivery retries belong to `EmailDispatcherService`, which is already built. If the insert throws for a reason other than a duplicate, the automation run retries.

`declined_notify_me` and `expired_notify_me` default `to` to `envelopes.sender_email`. If that column is null, the run is `failed` with `retryable` false and slug `sender_email_missing`.

Cap 10 recipients on one recipe. Validate emails the same way `CreateContactDto` does (trim, lower-case, max 320). The worker does not expand “all contacts”. A separate counter allows 50 `automation_copy` recipient-messages per owner per UTC day, shared with the MCP quota, enforced with `pg_advisory_xact_lock` on the owner id. Over the cap, the run stays queued until the next UTC day rather than being marked failed. Slug `email_copy_daily_cap`.

This mail is separate from `signed_to_sender` and `completed`. Turning on `signed_notify_list` does not suppress those.

An MCP recipe that emails any address other than the owner’s mailbox stays disabled until the owner approves, as described above. A signed-in Save turns that recipe on immediately and sends a short notification email. Addresses other than the account’s own mailbox confirm before first use: Seald sends one “Confirm you want notices from <sender name> about documents they send” mail, and the address is active only after they click. The footer is the `{{legal_entity}} · {{legal_postal}}` block above, and the stop link removes only that address.

## Free-plan limits

No new infrastructure.

| Limit | Value | Why |
| --- | --- | --- |
| Recipes per owner | 10 | Bounds rows and matcher work. |
| Recipients per email recipe | 10 | Bounds outbox fan-out. |
| Email copies per owner per UTC day | 50 | Shared with the MCP quota, so a recipe cannot flood the mail provider. |
| Webhook response stored | Status code only, body discarded after 64 KB | Keeps Postgres small. |
| Run retention | Done runs older than 30 days, 200 rows per idle pass. Failed runs stay until Retry, Fix, or delete. | A bad URL stays visible until the owner deals with it. |
| Trigger retention | Delete `automation_triggers` on match. Sweep leftover `matched` rows after 24 hours. | The partial pending index is the rescan. The checkpoint is an optimization. |
| Worker | Same Node process, `WORKER_ENABLED`, in-flight 2, batch 1 | Shares the Kysely pool in `DbModule`. Does not add a connection. |
| Webhook timeout | 10s | Leaves room under other work on the event loop. `fetch` is asynchronous; the seal loop is not blocked on the socket. |
| PDF size | Existing 25 MB caps (`MAX_PDF_BYTES`, `GDRIVE_CONVERSION_MAX_BYTES`) | Drive upload already holds artifact bytes in memory. Automations do not raise that. |
| Supabase | No extra project, no new extension | Tables are ordinary Postgres. |

The matcher inserts a handful of rows per signature. It does not store PDFs. If the free database approaches its size limit, the retention pass is the relief valve, not a new cluster.

## Run history and recipe UI

### API

Session JWT, flag-gated 404, owner scoped.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/automations` | Recipes without secrets. |
| `POST` | `/automations` | Create from a `recipe` id and blanks. Webhook response includes `secret` once. |
| `PATCH` | `/automations/:id` | Enable, rename, replace URL, replace folder, replace addresses. |
| `POST` | `/automations/:id/rotate-secret` | New secret once. |
| `DELETE` | `/automations/:id` | Cascade. |
| `GET` | `/automations/:id/runs?cursor=` | Newest first, 20 per page. |
| `POST` | `/automations/:id/test` | One webhook POST, `type: automation.test`, not stored as a run. Returns `recipe_not_approved` and does not call the network while the recipe is waiting on approval. |
| `POST` | `/automations/:id/runs/:runId/retry` | One tap. Same run id. Allowed only when `retryable` is true. Otherwise `retry_not_allowed`. |

Create validates the recipe id against the table above and rejects a trigger/action pair that is not in that table (`validation_error`).

### UI

Concept A, v2. Minimal copy. The main task is one or two taps. Extra fields sit behind “Advanced”. Routes `/settings/automations`, `/settings/automations/new?recipe=<id>`, `/settings/automations/:id`, and the same paths under `/m/settings/automations`. One column, 720px cap, the same component tree in both shells. Sheets are bottom sheets on mobile and dialogs on desktop.

Status words are Done, Failed, Retrying, Off, Expired, and Denied. A disabled recipe shows Off. A queued or running run shows no status word. A run in backoff shows Retrying. A finished success shows Done. A finished failure shows Failed. Expired is not a run status: a run does not expire. Expired is an approval past 24 hours or a changed draft. Denied is the approval word, not a run status. Do not show Queued or Sent.

Entry is the settings index row (desktop `/settings`, phone `/m/settings`). The phone drawer has one “Settings” row. Drive stays at `/m/send/settings`. No new `NAV_ITEMS` item. Flag off hides the row.

Flow:

1. Empty state is the recipe gallery. Each card is one short line and “Use this”. Launch gallery is webhook and Drive only. Email cards appear in the email PR. Nothing says “coming soon”.
2. “Use this” is the second tap. Webhook asks for the URL. Drive saves to “My Drive / Seald” with no picker. Email defaults to the owner. Save turns the recipe on. The flow is recipe, then Save, then on. The owner does not approve their own change. An external destination sends a short notification email. “Only for one template”, extra addresses, a different Drive folder, the once-per-signer note, and the `with_signer` warning sit behind “Advanced”.
3. List: a switch per recipe (`ReminderToggle` promoted to a shared switch, `role="switch"`, 44px target) and the last-run word. “3 of 10” sits behind “Advanced”. The switch PATCHes `enabled`. A disabled recipe shows Off. Runs already in flight still finish.
4. The server generates the webhook secret. `SecretOnceSheet` shows it with Copy and nothing else. It is copyable only on that create sheet, and again only when the owner rotates. Afterwards the list says “Secret set”. The sheet does not describe how the secret is stored. The old secret verifies for 24 hours after rotation.
5. Run history is a pushed screen, `RunList`, 20 per page. A queued or running run shows no status word. A run in backoff shows Retrying and “attempt n of 8”. A finished success shows Done. A temporary failure that has finished automatic retries shows Failed and a Retry button (`retryable` true). A permanent failure shows Failed and Fix (`retryable` false), which opens the recipe. One short reason (“Drive needs to be reconnected”, “The URL was rejected”, “The site returned 404”). Expired and Denied are not run words.
6. Retry calls `POST /automations/:id/runs/:runId/retry` and keeps the same run id. Fix does not call that endpoint.
7. “Send test event” is behind “Advanced”. It calls `POST /automations/:id/test` with the same address checks and a 10 second timeout. Body `type` is `automation.test`. It is not stored as a run. A recipe the owner saved in the app can be tested. An MCP recipe that is still waiting on approval keeps the control off, and the API returns `recipe_not_approved` without calling the network.

Empty history: “Nothing has run yet. Send a document that matches this recipe.”

Shared components, each in its own PR before the page that needs it: `SecretOnceSheet`, `RunList`, `Checkbox`, `CodeSnippet`, the header bell, and promoting `MWBottomSheet` and `ReminderToggle` into `components/`.

## Test plan

Unit, Jest:

- Matcher: `sealed` enqueues `sealed_save_drive` and ignores a `declined` recipe. The event transaction writes a pending trigger and does not insert the job. A crash after commit leaves that trigger. Matching after commit, or the startup rescan, inserts the job. When the matcher throws, submit still succeeds and the rescan inserts the run. Two signers produce two runs. A duplicate of the same signer and trigger inserts one. `viewed` is asserted as first-open only.
- Webhook signer: known body and secret produce the expected hex. During rotation both headers are present. `timingSafeEqual` rejects a different length. Timestamp outside 300 seconds fails.
- SSRF: `http://`, `https://127.0.0.1`, `https://169.254.169.254`, `https://10.0.0.1`, `https://100.64.0.1`, a NAT64 address, a hostname that resolves to `192.168.0.5`, `::ffff:127.0.0.1`, `0.0.0.0`, `64:ff9b::a00:1`, `2002:0a00:0001::`, Seald’s own API, app, and Supabase hostnames, and any 3xx are blocked and do not open a socket. Use a stub resolver.
- Payload fixture for each `type` has no key matching `/token|sign_url|access_token/i`.
- Backoff schedule matches `backoffMs` for attempts 1 through 8, then `failed` with `retryable` true. A 404 is `failed` with `retryable` false. A second retry while a job exists for that run id inserts nothing. A `running` job with `locked_at` older than 15 minutes is claimed again. Twenty consecutive failures disable the recipe.
- Drive action: mock `GdriveExportService` to throw `TokenExpiredError` and expect `failed` / `reconnect_required`. A partial error with attempts remaining expects `retrying`.
- Email action: one `automation_copy` row per address, stable `dedupe_key`, second insert does not throw out of `insertOutboundEmailIdempotent`. `legal-footer.contract.spec.ts` covers `automation_copy`, including `{{legal_entity}} · {{legal_postal}}` and the line “You're receiving this because {{sender_email}} added you to a Seald automation”. The stop link removes that address only. `last_error` is a slug or a status code and contains no email address and no response body. A webhook URL is not present in `config`, logs, or GET responses.

Repository test against the pg-mem harness used by `outbound-emails.repository.pg.spec.ts`: claim skips a row locked by another claim, and a future `scheduled_for` is not claimed. Skip raw `for update` if pg-mem cannot parse it, and cover that statement in the e2e the same way `claimNext` is covered today.

E2E, `apps/api/test/automations.e2e-spec.ts`:

1. Flag on, owner, envelope, sealed event appended through the repository.
2. Local HTTP server on 127.0.0.1 is **not** the success target (that must be blocked). Point the recipe at a test server bound for the test and inject an allowlist only when `NODE_ENV=test`, so production code has no allowlist. Assert HMAC header and JSON `version`.
3. Assert a second publish of the same event does not POST twice.

Migration convention spec must pass, including the down file’s location.

Web, Vitest: gallery is the empty state; Drive create does not open a picker and names “My Drive / Seald”; the secret sheet has Copy and no checkbox; a temporary failure shows Retry; a permanent failure shows Fix and no Retry. Query by role. Cover `/settings/automations` and `/m/settings/automations`.

Do not mark the feature done on unit tests alone. The e2e covers matcher → job → webhook POST, and a Vitest test covers the mobile recipe screen.

## Pull requests

One feature per pull request, in the order the product review listed for this track. Each of these PRs uses minimal copy, one or two taps, and an “Advanced” link for the rest. The matcher hook lives in A1. MCP read tools do not depend on it, and it is not an MCP step. This track then ships each action alone. The flag stays off until a later change turns it on.

| PR | Feature |
| --- | --- |
| A1 | Tables, the pending trigger row inside `appendEvent`, and matching after commit. Worker off. Next free migration id. Recipe ids `sealed_save_drive` and `sealed_webhook` from the start. Partial index on `automation_triggers` where `status = 'pending'`. Matched trigger rows are deleted on match, with a 24-hour sweep for any that remain. The pending scan makes the checkpoint an optimization. Startup rescan from `(created_at, id)` minus five minutes. A matcher failure does not roll back submit or sealing. The test is: the matcher throws, submit succeeds, and the rescan inserts the run. |
| A2 | Webhook action: worker, `locked_at` reclaim, both signature headers, address checks. Secrets use `AUTOMATION_SECRETS_KEY`. No test endpoint and no `automations_test_webhook`. The e2e fixture inserts an enabled recipe. A signed-in create turns an external destination on and sends a short notification email. An MCP create stays disabled until the owner approves. The screen is not in this PR. |
| A2b | `POST /automations/:id/test` and `automations_test_webhook`. Both return `recipe_not_approved` and do not call the network while an MCP recipe is waiting on approval. A recipe the owner saved in the app can be tested. Ships after the approval email exists (MCP step 7a). A test is not stored as a run. |
| A3 | Automation tools. List, upsert, enable, list runs, `automations_get_run`, `automations_retry_run`. Retry refuses a permanent failure (`retryable` false). An MCP external destination stays disabled until the owner approves. Approval is email-first: a link to the standalone Approve/Deny page, with the in-app queue as secondary. The settings Save path is not this approval. `automations:write` is off by default. The test tool is A2b, not this PR. |
| A4 | Shared UI if the MCP track has not landed it: `SecretOnceSheet`, `RunList`, `Checkbox`, `CodeSnippet`, the header bell, `MWBottomSheet`, switch from `ReminderToggle`. |
| A5 | Settings index row if missing, then the automations page: gallery, one-tap create, list with switches, secret shown once with Copy only, run history with Retry or Fix. Save turns the recipe on. Webhook card, and the Drive card only after A6. Nothing says “coming soon”. |
| A6 | Drive-save recipe `sealed_save_drive`. Still `drive.file`. Default folder “My Drive / Seald”. Picker only under Advanced. A signed-in Save turns it on and sends a short notification email. An MCP enable still needs approval. Approval is email-first: a link to the standalone Approve/Deny page, with the in-app queue as secondary. |
| A7 | `email_copy`, the footer (`{{legal_entity}} · {{legal_postal}}` and the “added you to a Seald automation” line), the stop link that removes only that address, `legal-footer.contract.spec.ts`, the 50-a-day cap, and the email recipes. A signed-in Save turns on a recipe whose recipient is not the owner, and sends a short notification email. An MCP enable still needs approval. Approval is email-first: a link to the standalone Approve/Deny page, with the in-app queue as secondary. |
| A8 | Twenty-failure auto-disable, and the owner email that goes with it. |

`workflowAutomations` flips on in its own change after A2b has posted a test event to a staging URL.

Slack stays out. A later PR would add a Slack app, its own secret, and one card.

## Open questions

1. Should template scope ship with the automations page or wait until `source_template_id` is set by the use-template flow? The column can land in A1 and stay null until that write exists. Until then, template-scoped recipes match nothing, so the UI hides “Only for one template”.
2. The test-only SSRF allowlist versus a hostname the production denylist does not know. The denylist stays on in e2e.
3. `AUTOMATION_SECRETS_KEY` unset. Webhook create returns 503. Tests set the env var. This feature does not call a remote key service.
4. OAuth client registration for ChatGPT and Claude is an MCP question. This feature does not add it.

## Risks

| Risk | What we do |
| --- | --- |
| A recipe POSTs a signing link or a signer’s email by default | Default payload is ids only. `with_signer` is opt-in. Tests reject token-shaped keys. |
| SSRF against cloud metadata, Seald’s own hosts, or the database host | HTTPS only, undici pin, private, unspecified, `192.0.0.0/24`, `240.0.0.0/4`, CGNAT, NAT64, IPv4-mapped, and 6to4-with-private ranges blocked, plus Seald’s API, app, and Supabase hostnames. Redirects rejected, hop limit 1. |
| Replay of a captured webhook | Timestamp window plus receiver-side dedupe on run id. |
| Secret or webhook URL in `config` jsonb or in logs | The signing secret and the URL are only in the encrypted columns, with the key in the environment. `config` keeps `url_host` and `payload_detail`. Logs store slugs and status codes. The product copy says “Secret set”. |
| Customer URL hangs the API process | 10 second abort, in-flight cap 2, separate from the seal claim loop. |
| Drive token revoked and the user is not told | Run `failed` with `retryable` false and slug `reconnect_required`. History screen uses that sentence. |
| `sealed` runs before files exist | Trigger on `sealed`, which `SealingService` appends after the objects are stored. Do not trigger Drive on `all_signed`. |
| Duplicate emails on worker retry | `dedupe_key` and `insertOutboundEmailIdempotent`. |
| Matcher throws and the signer’s submit or sealing fails | The event transaction writes the event and one pending trigger row. Matching runs after commit. A thrown match is logged, the trigger stays pending, and the startup rescan finishes it. Submit and sealing stay committed. The matcher never calls the network. |
| Free database growth | Caps on recipes and recipients. Succeeded runs age out at 30 days. Failed runs stay until resolved, which is a small set. No PDF bytes in these tables. |
| Two deploys both claim jobs | `skip locked`, same as email. Safe if a second node appears later. |
| Enum `automation_copy` added before the template exists | `upsertRecipe` refuses `email_copy` until the email PR. The dispatcher’s unknown-kind path must not be the steady state. |
| A recipe emails the signer a second signing link | `automation_copy` has verify and dashboard URLs only, plus the stop link. |
| A recipe starts posting to a URL the owner did not check | An MCP external destination stays disabled until the owner approves. Approval is email-first: a link to the standalone Approve/Deny page, with the in-app queue as secondary. A signed-in Save turns the recipe on and sends a short notification email. A test POST to an unapproved MCP recipe is refused with `recipe_not_approved`. A test is not stored as a run. |
| Job stuck in `running` after a crash | Reclaim when `locked_at` is older than 15 minutes. |

## Data-subject requests

Seald cannot recall data already delivered to a webhook, a Drive folder, an email recipient, or an MCP client. Deleting a Seald account or envelope does not delete those copies. A signer’s request that Seald receives is forwarded to the owner (Privacy §7, §13A). The owner handles the external copies.

`automation_runs.last_error` stores a slug or a status code only. It never stores an upstream body, a signer name, an email address, or the webhook URL. A test asserts that. Completed runs are kept for 30 days. Failed runs stay until Retry, Fix, or delete.

## Legal text

Drafts for counsel. Not licensed counsel, and not legal advice. The v0.4 text ships in each feature’s enabling PR, not in a docs-only change. That PR uses the drafts in PR #368 comment 5907683343 (T1–T4, P1–P5, D-1–D-5, S1, A1–A2), plus T1a and the corrections below. Version bumps stay `terms_v0.4`, `privacy_v0.4`, `dpa_v0.4`, `aup_v0.3`, `sub_processors_v0.4`.

**T1a (Terms §4.1, after the second paragraph).** When Seald asks you to approve an action by email or in the app, an approval given from your inbox or your account counts as your approval, even if someone or something else with access to your inbox or account gave it. Keep your email account secure, and don't let an agent or other software open or act on Seald approval emails.

**D-5 correction (DPA Annex II).** Webhook signing secrets are stored separately from the key needed to read them. The customer-facing draft must not say the application encrypts them, and it must not say AWS KMS. Implementation, not customer copy: the worker uses AES-GCM with `AUTOMATION_SECRETS_KEY` and AAD set to `automation_id`.

**P4 correction (Privacy retention).** Automation run history (time, action, status code, envelope reference): completed runs for 30 days; failed runs until you retry or fix the recipe, or delete it. Copies delivered to a destination a sender chose stay with that destination. Deleting data in Seald does not delete those copies.

**Terms (automations).** You can ask Seald to call a URL, save files to a Drive folder you picked, or email a notice when something happens to a document you sent. You are responsible for the address, the folder, and the people you add. Seald sends those messages for you. They are not a signature.

**Privacy (webhooks and copies).** A webhook receives the ids you configured, and signer details only if you turn that on. An email copy goes to the addresses you listed. The stop link removes only that address. The footer is `{{legal_entity}} · {{legal_postal}}`.

**Acceptable use.** Do not use a recipe to mail people who did not ask for the message, or to hide who asked for it.

**Deletion.** Deleting the account deletes recipes, jobs, runs, and secrets, in the same `deleteAccountData` path as envelopes. A webhook, Drive file, email, or MCP client that already received a copy keeps it. The privacy notice says that. A signer’s request is forwarded to the owner.
