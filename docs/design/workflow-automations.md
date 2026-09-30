# Workflow automations for Seald — technical design

**Status:** proposal. This document does not change the product.
**Date:** 2026-09-30
**Audience:** API and web implementers.
**Companion:** [MCP server](./mcp-server.md)

A sender picks a short recipe, fills in a folder or a URL or an address list, and Seald runs it when an envelope event happens. The recipes are the product. A free-form workflow builder is not.

## Summary

Store recipes in `automations`. When `EnvelopesRepositoryPg.appendEvent` commits a row, an in-process publisher hands that event to a matcher. The matcher inserts one `automation_jobs` row and one `automation_runs` row. A worker in the same process as `EmailWorkerService` claims the job with `for update skip locked`, performs one action, and retries with backoff. Actions in this design: POST a JSON webhook, upload the sealed PDF and the audit trail to a Google Drive folder the user already picked, or email a copy to a list. Slack is named and not built.

The feature is dark until `workflowAutomations` is `true` in `packages/shared/src/feature-flags.ts`. While it is false the subscriber is not registered, the HTTP routes return 404, and the nav entry is hidden.

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

Last migration on `main` is `0019_email_signed_to_sender.sql`. The next id is `0020`. If the MCP API-key migration takes `0020`, this feature uses the next free id. Paired down scripts are required.

`AppShell` sends ≤640px viewports to `/m/send`. Phone UI for recipes lives outside the shell. `/settings/` and `/m/` are already SPA prefixes in `apps/landing/_worker.js`.

## Shared foundations

Both this feature and the [MCP server](./mcp-server.md) use one publisher.

`DomainEventPublisher` is a small port in `apps/api/src/events/`. `EnvelopesRepositoryPg.appendEvent` calls `publish` after the insert returns. The event object is the domain row (`id`, `envelope_id`, `signer_id`, `actor_kind`, `event_type`, `metadata`, `created_at`). Listeners run after the database transaction that wrote the hash chain, so a listener failure cannot roll the event back and cannot change `prev_event_hash`.

The publisher is in-process. A second API process would each see only the events it wrote, which matches today’s single-node deploy (`WorkerService` runs in the API process when `WORKER_ENABLED` is true). Do not add a `LISTEN/NOTIFY` hop until there is a second node. If a publish handler throws, log it and leave the `envelope_events` row as it is. The automation matcher is written to be safe when invoked twice for the same event id.

MCP tools that create envelopes call the existing services, which call `appendEvent`, which publishes. Agents do not get a private side door that skips recipes.

MCP tools over recipes, after phase A2, live in MCP phase M7 and call this feature’s service:

| Tool | Calls |
| --- | --- |
| `automations_list` | `list` |
| `automations_upsert_recipe` | `upsertRecipe` |
| `automations_set_enabled` | `setEnabled` |
| `automations_list_runs` | `listRuns` |

Those tools do not include webhook signing secrets in their output. Upsert of a webhook recipe returns the secret once, same as the settings UI.

## Recipes

The user picks one of these. The form asks only for the blanks.

| Recipe id | Trigger label | `event_type` | Action | Blanks |
| --- | --- | --- | --- | --- |
| `signed_save_drive` | When the document is sealed | `sealed` | `gdrive_upload` | Drive folder (picker) |
| `signed_webhook` | When the document is sealed | `sealed` | `webhook` | HTTPS URL |
| `declined_notify_me` | When someone declines | `declined` | `email_copy` | Defaults to the sender’s mailbox. Optional extra addresses. |
| `signed_notify_list` | When someone signs | `signed` | `email_copy` | Address list. This is in addition to `signed_to_sender`. |
| `completed_email_copy` | When the document is sealed | `sealed` | `email_copy` | Address list. This is in addition to the `completed` mail signers already get. |
| `viewed_notify_me` | When someone first views | `viewed` | `email_copy` | Sender mailbox. |
| `sent_webhook` | When the document is sent | `sent` | `webhook` | HTTPS URL |
| `expired_notify_me` | When the request expires | `expired` | `email_copy` | Sender mailbox. |

`sent` fires once per signer. A `sent_webhook` recipe runs once per `sent` event. The payload’s `signer` object tells the receiver which invitation went out. The recipe form says that.

Scope is the whole account, or one template.

- Account: `scope = account`, `template_id` null. The recipe runs for every envelope that owner sends.
- Template: `scope = template`, `template_id` set. The recipe runs only when the envelope was created from that template.

Template scope needs the envelope to remember the template. Add nullable `envelopes.source_template_id uuid references templates(id) on delete set null` in the automations migration. `templates_use` (HTTP and, later, MCP) sets it when it applies a template. Envelopes that never used a template do not match template-scoped recipes. Deleting a template sets the column to null and cascades the recipe row (`on delete cascade` from `automations.template_id`), so a deleted template does not leave a live recipe.

One owner may save at most 10 recipes (free-plan cap below). A recipe is one trigger and one action. “When sealed, save to Drive and call a webhook” is two recipes. That is deliberate.

Slack is not a recipe yet. The action enum includes `slack` so a later migration does not rewrite the type. The worker, if it ever sees that action, finishes the run as `dead` with slug `action_not_available` and does not call the network. The UI does not offer it.

## Data model

Migration `0020_automations.sql` or the next free id. Down script drops the new tables and the new enum types, and drops `envelopes.source_template_id` if this migration added it.

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
  'pending',
  'running',
  'succeeded',
  'retrying',
  'dead'
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
  kms_key_arn            text not null,
  wrapped_dek            bytea not null,
  previous_ciphertext    bytea,
  previous_wrapped_dek   bytea,
  previous_retired_at    timestamptz,
  created_at             timestamptz not null default now()
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
  trigger          automation_trigger not null,
  action           automation_action not null,
  status           automation_run_status not null default 'pending',
  attempts         integer not null default 0,
  last_error       text,
  response_status  integer,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  unique (automation_id, event_id)
);
```

`automation_jobs.run_id` references `automation_runs(id)` with `on delete cascade`. Add that foreign key in the same migration after both tables exist.

`config` shape by action:

| Action | `config` |
| --- | --- |
| `webhook` | `{ "url": "https://…" }` The signing secret is not in `config`. |
| `gdrive_upload` | `{ "folder_id": "string", "folder_name": "string|null", "account_id": "uuid|null" }` `account_id` null means the same most-recently-used account `GdriveExportService` already picks. |
| `email_copy` | `{ "to": ["email", …] }` Max 10 addresses. |
| `slack` | Unused. |

Webhook secrets are recoverable, because the worker has to compute HMAC. API keys in the MCP design are the opposite: those are stored as a SHA-256 hash and cannot be read back. For webhook secrets, reuse the envelope already implemented for Drive refresh tokens: `GDriveKmsService` (`GenerateDataKey` on `GDRIVE_TOKEN_KMS_KEY_ARN`, AES-GCM, ciphertext plus wrapped data key on the row). The same env vars the Drive module already requires. If the KMS key is unset, creating a webhook recipe returns 503 `automation_secrets_not_configured`, the same “fail loud” idea as `gdrive_oauth_not_configured`. Do not fall back to storing the secret in plaintext `config`. This is the existing key-management path for a server-side secret the worker must read back. Document bytes stay on the storage path they use today.

RLS: `enable row level security` on all four tables, no policies.

Indexes: `(owner_id, enabled)` on `automations`; `(scheduled_for)` on `automation_jobs` where `status = 'pending'`; `(owner_id, created_at desc)` on `automation_runs`.

`updated_at` uses the existing `set_updated_at` trigger pattern from `envelopes`.

Account deletion: `owner_id` cascades. `MeService` does not need a special case beyond what `on delete cascade` removes. Confirm in the account-deletion test that recipes, secrets, jobs, and runs go away with the user. Envelope events on preserved sealed envelopes (`0012_preserve_envelopes_on_user_delete.sql`) can outlive the owner; `automation_runs.owner_id` still cascades with the user, so history is deleted with the account. That is acceptable: the audit chain on the envelope remains, the recipe log does not.

## Execution

```
appendEvent
  → DomainEventPublisher
    → AutomationMatcher (only if workflowAutomations is on)
        → insert automation_runs (unique automation_id + event_id)
        → insert automation_jobs pointing at that run
AutomationWorkerService  (WORKER_ENABLED, same process)
  → claim job (skip locked)
  → run the action
  → mark run succeeded, or retrying with scheduled_for, or dead
```

Matcher rules:

1. Load the envelope by id. If `owner_id` is null (preserved envelope after account deletion), stop.
2. Map `event_type` to `automation_trigger`. Unmapped types stop.
3. Select enabled recipes for that owner where the trigger matches, and either `scope = account` or `template_id = envelope.source_template_id`.
4. Insert the run. The unique `(automation_id, event_id)` makes a duplicate publish a no-op (`on conflict do nothing`).
5. Insert the job only when the run insert returned a row.

The matcher does not perform HTTP, Drive, or email. It returns quickly so `appendEvent`’s caller (signing submit, sealing) is not waiting on a customer URL.

Worker, `apps/api/src/automations/automation-worker.service.ts`, copied in structure from `EmailWorkerService`:

- `onModuleInit` starts the loop when `WORKER_ENABLED` is true and the flag is on.
- Claim batch of 1, so a stuck action cannot pile up inside one tick. In-flight cap is 2 for the process.
- Claim SQL mirrors `claimNext` on `outbound_emails`: pick a job in `pending` with `scheduled_for <= now()` and `attempts < max_attempts`, `for update skip locked`, set status `running`, increment `attempts`. The run status `retrying` is what the history UI shows between attempts; the job itself waits in `pending` until `scheduled_for`.
- On success: set the run to `succeeded` and delete the job. The run remains.
- On a transient failure: set the run to `retrying`, set `last_error` (truncated to 500 chars), set the job back to `pending`, and set `scheduled_for` on both the job and the run’s next attempt. Backoff matches email: `backoffMs` from `email-dispatcher.service.ts` (2, 4, 8, … minutes, cap 6 hours). `max_attempts` 8. The claim query only selects jobs in `pending` with `scheduled_for <= now()`.
- On a permanent failure (4xx from the webhook other than 408 and 429, SSRF rejection, missing Drive connection, bad config): set the run to `dead`, delete the job, no retry.
- After `max_attempts`: set the run to `dead` and delete the job. That run is the dead letter. There is no second dead-letter table.
- Idle sleep 5 seconds, error sleep 10 seconds, same as the email worker.

`POST /internal/cron/flush-automations` calls the same `flushOnce(10)` the worker uses, with `X-Cron-Secret` and `CronController`’s constant-time compare. Caddy already hides `/internal/*`. This is the manual kick, not the steady-state path.

Disable and delete: `enabled = false` stops new jobs. Jobs already queued still finish. Deleting a recipe cascades jobs and runs.

`viewed` can fire more than once if the signer reopens the document. Confirm in `SigningService` whether `viewed` is appended once. The matcher keys off `event_id`, so two view events become two runs. If the service only writes `viewed` on the first open, the recipe already means “first view”. The implementation PR should assert that against the current `SigningService` and, if views are repeated, document it on the recipe card (“each time they open it”) or dedupe with a partial unique index on `(automation_id, envelope_id, signer_id)` for the `envelope_viewed` trigger. Prefer matching whatever the service already writes, and say so on the card.

## Webhook security

Action `webhook`. One URL, HTTPS, port 443.

### Signature

Header on every attempt:

```
Seald-Signature: t=<unix seconds>,v1=<hex hmac sha256>
```

String to sign: `` `${t}.${rawBody}` `` where `rawBody` is the exact bytes sent. HMAC key is the current webhook secret. During rotation the worker sends one header computed with the current secret. Consumers that still have the previous secret can verify either value for 24 hours; the settings UI shows that window. The worker does not send two signatures. The verify snippet we document for receivers tries the current secret, then the previous, and accepts `t` within 300 seconds of the receiver’s clock.

Replay: a captured request fails the timestamp window. A retry from Seald is a new timestamp and a new signature over the same body `id` (the run id). Receivers dedupe on `id`, not on `t`.

Rotation: settings action “Rotate secret” generates a new secret, moves the current ciphertext into `previous_*`, sets `previous_retired_at` to now plus 24 hours, shows the new secret once. After `previous_retired_at`, a daily pass in the worker clears `previous_ciphertext`. The old secret stops verifying.

The secret is shown once, the same interaction as an MCP API key. The list view shows “secret set” and the rotation date, not the secret.

### SSRF

Before every attempt, including retries:

- Scheme `https` only. Reject userinfo in the URL. Reject any port other than 443.
- Resolve the hostname. If any A or AAAA record is loopback, link-local (`169.254.0.0/16`, which includes the cloud metadata address), private (`10/8`, `172.16/12`, `192.168/16`), CGNAT (`100.64/10`), IPv6 unique-local or link-local, or an unspecified address, fail the run as `dead` with slug `webhook_url_blocked`.
- Connect to a resolved address that passed the check, with the original hostname as SNI and `Host`. Re-check on redirect. Allow at most one redirect, and only to another URL that passes the same checks. A redirect to a private address is `dead`.
- Timeout 10 seconds (`AbortSignal`). Read at most 64 KB of the response, then discard it. Store only the status code.
- DNS failure and connection timeout are transient (retry). A blocklist hit is permanent.

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

`type` is `envelope.sealed`, `envelope.sent`, `signer.signed`, `signer.declined`, `envelope.expired`, or `envelope.viewed`. `signer` is null when the event has no `signer_id` (`sealed` from the system, `expired`).

Included because the receiver is the owner’s server and these facts are already on the envelope: title, status, short code, public verify URL, the signer’s name and email for signer-scoped events.

Left out on purpose:

- Signing tokens, `sign_url`, `access_token_hash`, the `seald_sign` cookie, and anything from `outbound_emails.payload`.
- Storage paths and short-lived download URLs. A signed storage URL in a webhook would land in the receiver’s logs. The owner downloads through the app, or uses the Drive recipe.
- PDF bytes.
- The webhook secret, API keys, or Drive tokens.

A later version increments `version` and keeps sending `v1` until the recipe is edited to opt in. v1 receivers ignore unknown fields.

`User-Agent: Seald-Automations`.

## Drive upload

Recipe `signed_save_drive`, trigger `envelope_sealed` only. The sealed and audit objects exist at that point (`SealingService` writes them before the `sealed` event).

The folder id is whatever the user selected with the Google Picker in the recipe form. That is the same picker the envelope “Save to Google Drive” flow uses (`GET /integrations/gdrive/picker-credentials`, `google.picker` folder mode). Picker selection is what grants `drive.file` access to that folder. A hand-typed folder id from outside the picker will fail with `permission-denied`, and the run goes `dead` with that slug so the user reconnects or re-picks.

Execution calls `GdriveExportService.exportEnvelope` with the envelope’s sealed and audit storage paths and the recipe’s `folder_id` / `folder_name`. The service:

- Refreshes the access token (`GDriveService.getAccessToken`). `TokenExpiredError` → run `dead`, slug `reconnect_required`. The history row tells the user to open Drive settings.
- No connected account → `dead`, slug `gdrive_not_connected`.
- `RateLimitedError` → transient, honor `retryAfterMs` as `scheduled_for` if it is later than the normal backoff.
- Updates files in place when `gdrive_envelope_exports` already has ids for that envelope, account, and folder (`0017`). A retry after a partial upload continues from those ids.
- Partial success (sealed stored, audit failed) → run `retrying` if attempts remain, `last_error` naming the artifact. The export row already keeps the successful file id.
- Both files stored → run `succeeded`.

The worker uses the recipe’s `account_id` when set. Otherwise it uses the export service’s current rule (most recently used non-deleted account). `gdriveMultiAccount` stays off; the form does not ask the user to pick an account until that flag is on.

Failure copy in the run history is the slug, not the upstream body. Same rule as `mapGdriveSaveError`: do not store Google’s raw error text if it might contain a token. `GdriveExportService` already avoids putting token material in its result.

## Email copy

Action `email_copy` inserts `outbound_emails` through `insertOutboundEmailIdempotent`.

New `email_kind` value `automation_copy`, added with `alter type … add value` in this feature’s migration (same pattern as `0019`). A new value cannot run inside a transaction in older Postgres; follow whatever `0019` did (`add value if not exists` outside an explicit transaction block). Down migrations cannot remove an enum value safely; the down script documents that the value remains, matching the caution needed for `signed_to_sender`.

Template files under `apps/api/src/email/templates/automation_copy/`, registered in `TemplateService` and in `TEMPLATE_KINDS` inside `email-dispatcher.service.ts`. Subject and body state that the sender asked Seald to forward a notice. Include title, status, signer name when present, verify URL, and a link to the envelope in the app (`/document/<id>`). Do not include a signing link.

`dedupe_key`: `automation_copy:<run_id>:<email>`. A worker retry that inserts again hits the unique index and `insertOutboundEmailIdempotent` treats that as success.

The run is `succeeded` once the outbox rows are inserted, not when Resend accepts them. Delivery retries belong to `EmailDispatcherService`, which is already built. If the insert throws for a reason other than a duplicate, the automation run retries.

`declined_notify_me` and `expired_notify_me` default `to` to `envelopes.sender_email`. If that column is null, the run is `dead` with `sender_email_missing`.

Cap 10 recipients. Validate emails the same way `CreateContactDto` does (trim, lower-case, max 320). The worker does not expand “all contacts”.

This mail is separate from `signed_to_sender` and `completed`. Turning on `signed_notify_list` does not suppress those.

## Free-plan limits

No new infrastructure.

| Limit | Value | Why |
| --- | --- | --- |
| Recipes per owner | 10 | Bounds rows and matcher work. |
| Recipients per email recipe | 10 | Bounds outbox fan-out. |
| Webhook response stored | Status code only, body discarded after 64 KB | Keeps Postgres small. |
| Run retention | 30 days, deleted by the worker’s idle pass, 200 rows per pass | History UI stays light. Dead letters live in this same table until they age out. |
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

Create validates the recipe id against the table above and rejects a trigger/action pair that is not in that table (`validation_error`).

### UI (phase A4)

Desktop: `/settings/automations` inside `AppShell`, linked from the settings index described in the MCP doc. If MCP has not shipped the index yet, add the route and a link from the user menu the same way integrations is linked (`handleOpenIntegrations` in `AppShell.tsx`).

Phone: `/m/settings/automations`, outside `AppShell`, linked from the mobile sender next to `/m/send/settings`.

Layout, one column on a 375px width and the same column capped on desktop:

1. Title “Automations”, one line: when something happens to a document you sent, Seald can call a URL, save the sealed files to Drive, or email you.
2. Recipe cards, not a blank canvas. Each card is the sentence (“When the document is sealed, save it to a Drive folder”) and a button “Use this”.
3. The form for that card only. Drive card: if no account, send the user through the existing OAuth popup, then the folder picker. Webhook card: URL field, then the secret sheet (copy, “I have saved this”). Email card: address chips, add and remove.
4. Optional “Only for one template” select, fed by `GET /templates`. Default is the whole account.
5. A list of enabled recipes with a switch. The switch calls `PATCH` enabled.
6. Run history is a second screen, pushed from the recipe, not a table that has to fit beside the form. Each row: time, envelope title, status word (Queued, Sent, Retrying, Failed), and for failures the slug in plain language (“Drive needs to be reconnected”, “The URL was rejected”, “The site returned 404”). Retry is not a user button in v1; the worker retries. A failed dead letter shows “Edit recipe” so they can fix the URL or folder.

Empty history: “Nothing has run yet. Send a document that matches this recipe.”

Flag off: hide the links. Do not render a half-wired form.

## Test plan

Unit, Jest:

- Matcher: `sealed` enqueues a Drive recipe and ignores a `declined` recipe. Template scope ignores an envelope with a different `source_template_id`. Duplicate `event_id` inserts one run.
- Webhook signer: known body and secret produce the expected hex. Timestamp outside 300 seconds fails a small `verify` helper used by tests (the helper is what we document, and the test is the spec).
- SSRF: `http://`, `https://127.0.0.1`, `https://169.254.169.254`, `https://10.0.0.1`, a hostname that resolves to `192.168.0.5`, and a redirect to loopback are `webhook_url_blocked` and do not open a socket. Use a stub resolver.
- Payload fixture for each `type` has no key matching `/token|sign_url|access_token/i`.
- Backoff schedule matches `backoffMs` for attempts 1 through 8, then `dead`.
- Drive action: mock `GdriveExportService` to throw `TokenExpiredError` and expect `dead` / `reconnect_required`. A partial error with attempts remaining expects `retrying`.
- Email action: one `automation_copy` row per address, stable `dedupe_key`, second insert does not throw out of `insertOutboundEmailIdempotent`.

Repository test against the pg-mem harness used by `outbound-emails.repository.pg.spec.ts`: claim skips a row locked by another claim, and a future `scheduled_for` is not claimed. Skip raw `for update` if pg-mem cannot parse it, and cover that statement in the e2e the same way `claimNext` is covered today.

E2E, `apps/api/test/automations.e2e-spec.ts`:

1. Flag on, owner, envelope, sealed event appended through the repository.
2. Local HTTP server on 127.0.0.1 is **not** the success target (that must be blocked). Point the recipe at a test server bound for the test and inject an allowlist only when `NODE_ENV=test`, so production code has no allowlist. Assert HMAC header and JSON `version`.
3. Assert a second publish of the same event does not POST twice.

Migration convention spec must pass, including the down file’s location.

Web, Vitest: recipe list renders the sentences; webhook create shows the secret once; history renders a dead run’s plain-language slug. Query by role. One test at a narrow viewport width for the mobile route component.

Do not mark the feature done on unit tests alone. The e2e covers matcher → job → webhook POST, and a Vitest test covers the mobile recipe screen.

## Phased rollout

Flag `workflowAutomations` stays `false` until A2 has a webhook test on a staging host. Each phase deploys alone.

| Phase | Ships | Safe while the flag is off |
| --- | --- | --- |
| A1 | Publisher hook in `appendEvent` if MCP M1 has not added it. Migration for tables, `source_template_id`, and the `automation_copy` enum value. Matcher behind the flag, writing jobs, with the worker **not** started. No HTTP routes. | Publisher with zero listeners. Tables unused. Enum value unused. Existing mail unchanged. |
| A2 | Worker, webhook action, HMAC, SSRF, `flush-automations` cron, run list API, rotate secret. A minimal API-only create path so the e2e can insert a recipe without the UI. Dead-letter status on the run. | Routes 404. Worker returns immediately when the flag is off. |
| A3 | Drive action on `sealed`, folder id in `config`, calls `GdriveExportService`. Still requires `gdriveIntegration` and a connected account. | Drive code not invoked. |
| A4 | Recipe UI, desktop and mobile. Removes any “raw JSON” create path from the public SPA; the API still accepts the recipe id and blanks. | Nav hidden. |
| A5 | `email_copy` template and the notify-me / notify-list recipes. Outbox dedupe. | Kind exists from A1; dispatcher ignores unknown kinds today by failing the row (`unknown_template_kind`). Do not enqueue `automation_copy` until the template is registered in this phase. A1 may add the enum value; A5 adds the template before any recipe can select the action. Guard `upsertRecipe` so `email_copy` is rejected until A5’s code is present (the action is simply not in the allowed recipe table until that PR). |

Suggested order if both designs start together: A1’s publisher first (or M1 if that merges sooner), then M1 read-only MCP, then A2 webhooks, then the rest. Neither track needs the other to be flag-on.

Slack stays out of this table. A future phase would add a Slack app, a signing secret, and one recipe card. It should not reuse the webhook action with a Slack-shaped body hidden inside, because the URL rules and the secret rotation are different.

## Open questions

1. `viewed` cardinality. Confirm at implementation whether `SigningService` appends one `viewed` or one per session, and write that sentence on the card.
2. Should template scope ship in A4 or wait until `source_template_id` has been set by the SPA’s use-template flow for a release? The column can land in A1 and stay null until the use-template PR sets it. Until then, template-scoped recipes match nothing, so the UI should hide “Only for one template” until that write exists.
3. Retention of 30 days versus “keep dead letters until the user deletes the recipe”. Dead letters are how someone notices a bad URL. Thirty days is the proposal; if support needs longer, raise retention before raising any other limit.
4. Whether the test-only SSRF allowlist is a cleaner seam than binding the test server to a hostname the production denylist does not know. The denylist must stay on in the e2e.
5. KMS unset in local dev. Drive already has this problem (`gdrive_oauth_not_configured` / KMS stub). Webhook create should fail the same way, and local tests should use the existing KMS test double rather than a plaintext column.

## Risks

| Risk | What we do |
| --- | --- |
| A recipe POSTs a signing link to a third party | Payload allow-list. Tests reject token-shaped keys. `send`’s plaintext token never leaves `EnvelopesService` into the matcher. |
| SSRF against cloud metadata or the database host | HTTPS only, resolve-and-pin, private and link-local ranges blocked, redirects re-checked, permanent failure. |
| Replay of a captured webhook | Timestamp window plus receiver-side dedupe on run id. |
| Secret in `config` jsonb or in logs | Secret only in the KMS envelope columns. Logs store slugs and status codes. |
| Customer URL hangs the API process | 10 second abort, in-flight cap 2, separate from the seal claim loop. |
| Drive token revoked and the user is not told | Run `dead` with `reconnect_required`. History screen uses that sentence. |
| `sealed` runs before files exist | Trigger on `sealed`, which `SealingService` appends after the objects are stored. Do not trigger Drive on `all_signed`. |
| Duplicate emails on worker retry | `dedupe_key` and `insertOutboundEmailIdempotent`. |
| Matcher throws and the signer’s submit fails | Publish is after the event insert, and handler errors are caught and logged. Submit does not depend on recipe success. |
| Free database growth | Caps on recipes, recipients, and run retention. No PDF bytes in these tables. |
| Two deploys both claim jobs | `skip locked`, same as email. Safe if a second node appears later. |
| Enum `automation_copy` added before the template exists | `upsertRecipe` refuses that action until A5. The dispatcher’s unknown-kind path must not be the steady state. |
| A recipe emails the signer a second signing link | `automation_copy` template has verify and dashboard URLs only. |
