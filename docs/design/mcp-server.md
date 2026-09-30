# MCP server for Seald — technical design

**Status:** proposal. This document does not change the product.
**Date:** 2026-09-30
**Audience:** API and web implementers.
**Companion:** [workflow automations](./workflow-automations.md)

An MCP server lets an AI agent or other bot prepare a document, place fields, send it, and track it, using the same services the SPA uses today. The signer still signs in the browser. The agent never signs for them.

## Summary

Host a remote MCP endpoint on the existing Nest API (`POST /mcp` on the EC2 host behind Caddy). Authenticate with a per-user API key first, and with OAuth 2.1 in a later phase that reuses the Supabase login the sender already has. Tools call `EnvelopesService`, `ContactsService`, `TemplatesService`, and the Google Drive module. Send, remind, and cancel return `approval_pending` until the owner approves in Seald. A confirmation token only checks that the draft did not change. Signing stays on `POST /sign/submit`.

The feature is dark until `mcpServer` is `true` in `packages/shared/src/feature-flags.ts`. While it is false, `/mcp` returns 404, the same way `gdriveIntegration` hides `/integrations/gdrive/*`.

## MCP-first

1. Every feature pull request ships the MCP tool for that feature, or it adds a written exclusion (signing, key minting, changing approval mode). A feature that the SPA can do and an agent cannot is called out in the parity list, not left implied.
2. One service layer. HTTP controllers and `McpController` are thin adapters. Envelope rules live in `EnvelopesService` and the repositories. The MCP module parses JSON-RPC, checks the credential, and maps errors. It does not grow a second copy of send, remind, or search.
3. A parity test maps each sender route to a tool name or to the exclusion list. The test lands with the transport PR and grows in every tool PR. Excluded on purpose: everything on `SigningController`; `POST /me/api-keys` and revoke; the session-only patch that sets `require_owner_approval`; `DELETE /me`.
4. Tool names are `noun_verb`. No name contains `sign`. Changes are additive. A breaking argument change is a new tool name. `initialize` pins the protocol revision. JSON we send to a customer’s URL carries a `version` field.
5. Scopes are least privilege. `envelopes:read` is the only scope pre-checked, and it covers documents only. `envelopes:send` and `automations:write` are off until the owner taps them. An agent cannot change `require_owner_approval`. That column defaults to true, and only a Supabase session on the Developers page can set it.
6. The web app stays the place a person approves, reviews, and manages keys. Mobile-first, one column, no new `NAV_ITEMS` row.
7. Every feature pull request follows the same UX rule: minimal copy, one or two taps for the main task, and anything else behind an “Advanced” link. Status words in the product are only Done, Failed, Retrying, Off, and Expired.

## Non-goals

- A tool that signs, declines, fills a signer field, or accepts the ESIGN disclosure. Those routes stay on `SigningController` (`apps/api/src/signing/signing.controller.ts`), guarded by `SignerSessionGuard` and the `seald_sign` cookie.
- Returning signing-link tokens (`?t=`), `access_token_hash`, or the signer cookie in any tool result, resource, or log line.
- A new signature level. Completed envelopes stay a simple electronic signature with the consent and audit trail described in `packages/shared/src/product-claims.ts` (`SIGNATURE_LEVEL_NOTE`). This design does not call the result an advanced or qualified electronic signature, and it does not claim handwritten-signature equivalence.
- A change to how PDFs are stored. MCP calls the existing upload and download paths.
- Broadening the Google scope past `https://www.googleapis.com/auth/drive.file` (`apps/api/src/integrations/gdrive/oauth-pkce.ts`).
- Guest or anonymous Supabase sessions. `AuthUser.email` is null for those sessions (`supabase-jwt.strategy.ts`). Send already rejects them unless a body email is supplied (`envelopes.controller.ts`). MCP requires a mailbox on the account.

## What exists today

| Piece | Where | What MCP reuses |
| --- | --- | --- |
| Sender auth | `apps/api/src/auth/auth.guard.ts`, `supabase-jwt.strategy.ts` | Supabase JWT, issuer `{SUPABASE_URL}/auth/v1`, audience `SUPABASE_JWT_AUDIENCE`. Global deny-by-default. `@Public()` opts out. |
| Envelopes | `EnvelopesController` / `EnvelopesService` | Create, list, patch, delete draft, upload, signers, fields, send, cancel, remind, events, download URL, save to Drive. |
| Contacts | `ContactsController` / `ContactsService` | CRUD. Unique `(owner_id, email)` from `0001_contacts.sql`. |
| Templates | `TemplatesController` / `TemplatesService` | CRUD, `POST /:id/use` (bumps `uses_count` only), example PDF. Field layout is jsonb `templates.field_layout`. |
| Email | `outbound_emails`, `EmailDispatcherService`, `EmailWorkerService` | Invite and manual reminder rows. `EnvelopesService.remindSigner` inserts a `reminder` row; `EmailWorkerService` and `POST /internal/cron/flush-emails` drain it. Open PR #367 adds `ReminderWorkerService` (`apps/api/src/reminders/reminder-worker.service.ts`) for a daily sweep of unsigned signers. MCP remind stays the manual path and must not double-send inside that 24 hour window (`dedupe_key` `automated_reminder:…` on #367). |
| Jobs | `envelope_jobs`, `apps/api/src/sealing/worker.service.ts` | `for update skip locked` claim. One row per envelope, kinds `seal` and `audit_only` only. MCP must not enqueue work on this table. |
| Audit chain | `envelope_events.prev_event_hash`, `apps/api/src/envelopes/event-hash.ts` | Canonical JSON includes `metadata`. New attribution belongs in `metadata`, not in a new `actor_kind`. The enum is `sender`, `signer`, `system` (`0002_envelopes.sql`). `appendEvent` is the normal insert. `purgeOwnedDataForAccountDeletion` writes `retention_deleted` with its own insert (`envelopes.repository.pg.ts` around the account-deletion path). That row is not an automation trigger. |
| Idempotency table | `idempotency_records` (`0003_outbound_emails.sql`) | Schema exists. The only production writer today is account deletion, which deletes rows (`MeService`, `IdempotencyRepository.deleteByUser`). MCP is the first feature that stores responses here. |
| Drive | `GDriveController`, `GdriveExportService`, `gdrive_accounts`, `gdrive_envelope_exports` | OAuth PKCE, file list, conversion, folder upload of sealed + audit PDFs. |
| Rate limit | `ThrottlerModule` in `app.module.ts` | 5/s, 60/min, 1000/hr, skipped when `NODE_ENV=test`. Drive adds a per-user bucket (`GDriveRateLimiter`, default 30 per 60s). Remind is 1 invite-or-reminder per signer per hour. |
| Flags | `packages/shared/src/feature-flags.ts` | Compile-time booleans. No admin UI. Tests may set `globalThis.__SEALD_FEATURE_OVERRIDES__`. A runtime env kill switch (`MCP_DISABLED=true`) 404s `/mcp` even when the flag is on, so an incident does not need a rebuild. |
| HTTP limits | `apps/api/src/main.ts` | JSON body 1 MB. `requestTimeout` 30s. CORS `allowedHeaders` is `Content-Type` and `Authorization`. |
| Edge | `deploy/Caddyfile` | `/internal/*` is 404 at the public edge. `/mcp` is a normal public route and is proxied to the API container. |
| Web | Cloudflare Pages, `apps/landing/_worker.js` | SPA prefixes already include `/settings/` and `/m/`. `AppShell` sends viewports at or under 640px to `/m/send`, so a settings page inside `AppShell` never appears on a phone. |
| Migrations | last file on `main` is `0019_email_signed_to_sender.sql` | Do not hard-code the next id. Open PR #367 already uses `0020_envelope_reminders.sql`. Each migration PR takes the next free id at merge time. From `0013` up, every up-file needs `db/migrations/down/<id>_<name>_down.sql`. `migrate.sh` applies each file with `psql -1` (one transaction). On Postgres 17, `ALTER TYPE … ADD VALUE` is allowed inside that transaction. |

Envelope statuses the tools return: `draft`, `awaiting_others`, `sealing`, `completed`, `declined`, `expired`, `canceled`. Field kinds: `signature`, `initials`, `date`, `text`, `checkbox`, `email`. Coordinates are normalized 0–1, top-left origin, page ≥ 1 (`envelope_fields`, `PlaceFieldsDto`). Default expiry is 30 days (`DEFAULT_EXPIRY_DAYS` in `envelopes.service.ts`). PDF cap is 25 MB (`MAX_PDF_BYTES`). `delivery_mode` defaults to `parallel` and the signing service does not branch on it, so MCP does not expose a sequential mode.

`POST /templates/:id/use` does not copy `field_layout` onto an envelope. The SPA applies the layout in the browser. An MCP “use template” tool has to do that mapping on the server.

## Shared foundations

Both this server and [workflow automations](./workflow-automations.md) sit on one in-process domain-event publisher.

`appendEvent` is the normal insert (`envelopes.repository.pg.ts`, its own transaction around line 1349). Account deletion also inserts `retention_deleted` directly and that row is not a trigger. Automation matches are inserted inside the `appendEvent` transaction, with a checkpointed rescan as backup. See the automations doc. An in-process publish after commit is only a fast-path kick. A crash between commit and a later insert must not drop a `sealed` webhook.

Listeners:

- Automations subscribe and enqueue `automation_jobs` when `workflowAutomations` is on.
- MCP does not need a listener to perform its own tool calls. It calls the existing services, and those services already `appendEvent`.

The durable-match PR is its own pull request and lands before any recipe can fire. MCP does not need it to serve read tools.

When both flags are on, MCP manages automations through the same `AutomationsService` the settings UI uses. Those tools are their own PRs, after the webhook action exists. Creating or editing a recipe that adds an external destination (webhook URL, email address that is not the owner, Drive folder) requires the same in-app owner approval as a send, plus an email to the owner. That applies to MCP and to the settings form. `automations:write` is never pre-checked.

| Tool | Service | Scope |
| --- | --- | --- |
| `automations_list` | `AutomationsService.list` | `automations:read` |
| `automations_upsert_recipe` | `AutomationsService.upsertRecipe` | `automations:write` |
| `automations_set_enabled` | `AutomationsService.setEnabled` | `automations:write` |
| `automations_list_runs` | `AutomationsService.listRuns` | `automations:read` |

Recipe upserts do not send envelopes. Disabling an automation is immediate and does not need the send-confirmation token. Creating a webhook recipe still goes through the automations secret rules in the companion doc (the URL and signing secret are not echoed back after create).

## Transport

### Remote Streamable HTTP

One Nest controller, `McpController`, mounted at `mcp`.

| Method | Role |
| --- | --- |
| `POST /mcp` | JSON-RPC body. `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`. |
| `GET /mcp` | Not offered in v1. |
| `DELETE /mcp` | 405. |

The server is stateless. Responses omit `Mcp-Session-Id`. A single EC2 process is the production shape (`WorkerService` comments), and `main.ts` sets `requestTimeout` to 30 seconds, which is a poor fit for a long-lived SSE stream. Tool results return in the POST body. If a later phase needs server-initiated messages, give that route its own timeout instead of raising the global one.

The controller is `@Public()` because the global `AuthGuard` only accepts a Supabase JWT. MCP auth runs inside the controller (API key or, later, an MCP access token). An unauthenticated POST returns 401. When `mcpServer` is false, or when `MCP_DISABLED=true`, every method throws `NotFoundException('not_found')` before auth, matching `GDriveController.requireFlag`. The env switch is checked at request time so an incident does not need a rebuild.

CORS, for the MCP Inspector and other browser hosts: extend `allowedHeaders` in `main.ts` with `Mcp-Protocol-Version` and `Last-Event-ID`. Keep the existing origin allow-list. Non-browser clients (the stdio wrapper, Cursor) do not send `Origin`; `main.ts` already allows a missing origin.

Protocol version is pinned in `initialize`. Reject a client whose requested version the server does not implement, with a JSON-RPC error, not an HTTP 500. The implementation PR records the exact revision it tested.

`initialize` server info:

```json
{
  "protocolVersion": "<pinned at implementation>",
  "serverInfo": { "name": "seald", "version": "<api package version>" },
  "capabilities": { "tools": { "listChanged": false }, "resources": {}, "prompts": {} }
}
```

### Optional stdio wrapper

A local stdio process is optional. It is not required for the remote server.

While the SEALD name is in quiet use, do not publish this wrapper, or any package whose name contains `seald`, to npm or to an MCP registry. Another company already publishes developer SDKs under a similar name, and a public package would be indexed. The wrapper stays in the repo unpublished, or it uses a neutral name such as `mcp-http-bridge` that does not contain `seald`. The binary is not `seald-mcp`.

- Reads `SEALD_API_BASE_URL` (default `https://api.seald.nromomentum.com`) and `SEALD_API_KEY` from the environment.
- Speaks MCP on stdin/stdout.
- Forwards each JSON-RPC message to `POST /mcp` with `Authorization: Bearer <key>`.
- Does not store the key on disk. Does not log the bearer header.

## Auth

Two mechanisms, same scopes, same owner id. Keys ship in step 2. OAuth ships in its own later pull request. A request presents one credential. Scopes are the intersection of what the credential has and what the tool requires. Missing scope is a tool error `insufficient_scope`, HTTP 200 with `isError: true` (the JSON-RPC call itself succeeded). HTTP 401 is only for a missing, revoked, expired, or unknown credential.

### Scopes

| Scope | Allows |
| --- | --- |
| `envelopes:read` | List, search, status, pending signers, get, events, download URL, suggest fields. |
| `envelopes:write` | Create, patch, delete draft, upload, signers, place fields. |
| `envelopes:send` | Preview, send, remind, cancel, and the in-app approval queue. Default is human approval in the app. A confirmation token is not enough. |
| `contacts:read` / `contacts:write` | Contact CRUD. |
| `templates:read` / `templates:write` | Template CRUD, use, example PDF. |
| `gdrive:read` | List accounts and files, connect URL. |
| `gdrive:write` | Disconnect, start conversion, save sealed files to a folder. Disconnect and save both need in-app approval. |
| `automations:read` / `automations:write` | Later MCP tools. `automations:write` is off until the user checks it. Creating a recipe with an external destination still needs in-app approval. |

There is no scope that can sign, and no scope that can create API keys. Key management is the SPA session only (`RequireAuth`, Supabase JWT), so a leaked agent key cannot mint another key.

### Credential boundary

API keys and MCP access tokens are accepted only by `McpController` on `POST /mcp` and `POST /mcp/uploads`. They are not Supabase JWTs, so the global `AuthGuard` rejects them. A `seald_live_` bearer on `POST /envelopes/:id/send` returns 401. The same bearer on `/sign/*` returns 401 or 403. `/me/api-keys`, `DELETE /me`, and any email-change route stay on the Supabase session. An e2e test asserts that split. `/mcp` itself rejects a Supabase JWT (no token passthrough).

### API keys

The keys migration takes the next free id. It does not reuse `0020`, which #367 already claims. The confirmation-token table is a later migration, not this one. Paired down script in `db/migrations/down/`.

```sql
create table public.api_keys (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 80),
  prefix              text not null,
  key_hash            text not null check (char_length(key_hash) = 64),
  scopes              text[] not null,
  require_owner_approval boolean not null default true,
  allow_new_recipients boolean not null default false,
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz,
  expires_at          timestamptz,
  revoked_at          timestamptz
);
create unique index api_keys_prefix_key on public.api_keys (prefix);
create unique index api_keys_owner_name_live_idx
  on public.api_keys (owner_id, lower(name)) where revoked_at is null;
```

RLS on, no policies, same posture as `contacts` and `envelopes`. The API role bypasses RLS.

`require_owner_approval` defaults to true. Setting it to false is the unattended opt-in. That patch, and `allow_new_recipients`, can be set only from a Supabase session on the Developers page, after a warning sheet that quotes Terms §4.1. No MCP tool accepts either field. A key presented to that patch returns 401.

Generation:

1. 32 random bytes (256 bits), base64url, plus a short checksum so a truncated paste fails closed. Register the `seald_live_` prefix with GitHub secret scanning in the same PR.
2. Display form `seald_live_<secret>`, shown once in the settings UI.
3. `prefix` is `seald_live_` plus the first 8 characters of the secret. The unique index is on the full `prefix`, not a partial index, so two live keys cannot share one.
4. `key_hash` is hex SHA-256 of the full secret. SHA-256 is the right function because the secret is 256 bits of randomness, not a password, so a slow hash would only add latency. The secret is not stored, not logged, and not recoverable.

Verification: reject anything that does not start with `seald_live_`, look up the row by the unique `prefix`, compare hashes with `timingSafeEqual`. Then check `revoked_at`, `expires_at`, and scopes. Update `last_used_at` at most once a minute.

Revocation sets `revoked_at` and leaves the row. Do not hard-delete a key before account deletion, so audit snapshots of `key_name` and `key_prefix` still match a row the operator can explain. Account deletion cascades the rows. `MeService` also deletes confirmation and approval rows for that user.

Create path:

- `ApiKeysController` lives next to `MeController` (`apps/api/src/me/me.controller.ts` stays export and delete). Routes are `GET/POST /me/api-keys` and `POST /me/api-keys/:id/revoke`. Health `GET /me` is unchanged.
- Reject the call when `AuthUser.email` is null (guest and anonymous sessions, including the mobile sender).
- A key that includes `envelopes:send` requires a fresh login. The API rejects the create when the Supabase JWT `iat` is older than 10 minutes. The SPA sends the user through sign-in again before that submit.
- On success, enqueue an email to the owner (`email_kind` added in this migration, drained by `EmailWorkerService`) that names the key and the prefix. The secret is not in the email.
- Cap of 10 live keys is enforced inside `pg_advisory_xact_lock` on the owner id (or `select … from api_keys where owner_id = $1 for update`), then insert. The partial unique index on `(owner_id, lower(name))` is the backstop. A count-then-insert without the lock is not enough.

### OAuth 2.1 (later pull request)

The MCP authorization spec expects a protected resource, an authorization server, OAuth 2.1, PKCE with S256, and a resource indicator. Supabase Auth remains the place the human proves who they are. It is not, by itself, an MCP authorization server: it does not publish protected-resource metadata for this API, and MCP clients will not be registered in the Supabase dashboard one by one.

Seald’s API is both the resource server and a thin authorization server. Supabase is the identity provider behind the consent screen.

1. Client `POST /mcp` with no bearer token.
2. `401` and `WWW-Authenticate: Bearer realm="seald", resource_metadata="https://api.seald.nromomentum.com/.well-known/oauth-protected-resource"`.
3. Protected-resource metadata points at the authorization server on the same host and lists the scopes above. The resource identifier is `https://api.seald.nromomentum.com/mcp`.
4. Authorization-server metadata (`/.well-known/oauth-authorization-server`) advertises authorization-code, PKCE S256, and refresh-token rotation. Dynamic client registration is off (see open questions).
5. The user is sent to `/oauth/mcp/consent` (outside `AppShell`). The page requires a Supabase session, sends `frame-ancestors 'none'`, and shows the client name, the scopes, and the redirect host. Approve calls the API with the Supabase JWT. `state` is passed through and checked.
6. The authorization code is bound to `user_id`, `client_id`, S256 challenge, exact `redirect_uri`, resource, and scopes. Codes live in Postgres, single use, 60 seconds. Storage is Postgres, not the in-memory `OAuthStateStore`.
7. The token endpoint checks the verifier, the resource indicator (must equal the MCP resource URL), `client_id`, and the redirect URI. It returns an opaque access token (about 1 hour) and a refresh token.
8. Only hashes are stored. Refresh rotates the refresh token. Replaying an already-rotated refresh token revokes the whole grant. Refresh tokens also expire on an absolute lifetime (30 days) and an idle lifetime (7 days).

Redirect URIs are `https`, or a loopback URI under RFC 8252 (`http://127.0.0.1` or `http://[::1]` with any port). Exact string match of the port would reject native clients, so loopback compares host and path and accepts any port.

Dynamic client registration stays off. If a host cannot use an API key, prefer client-id metadata documents (CIMD: an `https` client id the server fetches) over an open registrar. The consent page labels a client “unverified” until the user has registered that redirect themselves.

Tables use the next free migration id: `oauth_clients`, `oauth_grants` (includes `require_owner_approval` and `allow_new_recipients`, same defaults as keys), `oauth_access_tokens`. RLS on, no policies. Grants are revoked, not hard-deleted, until account deletion.

Public clients only (PKCE, no client secret). A client that cannot open a browser uses an API key instead.

## Tool catalog

Conventions for every tool:

- Input is a JSON Schema object. Unknown fields are rejected.
- A tool error is `{ "isError": true, "slug": "remind_throttled", "message": "This signer was reminded less than an hour ago.", "retryable": true, "retry_after_seconds": 1800, "next_steps": [{ "tool": "envelopes_status", "args": { "envelope_id": "…" } }] }`. `message` is a sentence. `retry_after_seconds` is omitted when there is nothing to wait for. `next_steps` names the next tool call that would make progress, and it is an empty array when the owner has to act in Seald.
- The slug matches `HttpExceptionFilter`, which returns `{ "error": "<slug>" }`. MCP maps that slug through and adds `message`, `retryable`, and `next_steps`. It does not invent a second slug vocabulary.
- `approval_pending` is a successful tool result, not an error: `{ "status": "approval_pending", "approval_id", "summary" }`.
- `owner_id` always comes from the credential, never from the arguments.
- Every mutating tool requires `idempotency_key` (string, 8–200 chars) and `dry_run` (boolean). `dry_run: true` runs validation and returns `{ "dry_run": true, "would": {…} }` without writing, sending, consuming a confirmation, or opening an approval. It does not store an idempotency row.
- Every list takes `limit` (default 20, max 50) and `cursor`, and returns `next_cursor`. The cursor is opaque and built from `(updated_at, id)`. This includes contacts, templates, events, approvals, and automation runs. The service method grows the cursor; the controller and the tool both pass it through.
- Annotations: `readOnlyHint`, `destructiveHint`, `openWorldHint` as marked per tool.
- Tools not yet shipped are absent from `tools/list`, not stubbed.

Shared output types, sketched:

```json
{
  "Envelope": {
    "id": "uuid",
    "title": "string",
    "status": "draft|awaiting_others|sealing|completed|declined|expired|canceled",
    "short_code": "string",
    "tags": ["string"],
    "original_pages": 0,
    "expires_at": "date-time",
    "sent_at": "date-time|null",
    "completed_at": "date-time|null",
    "signers": ["Signer"],
    "fields": ["Field"]
  },
  "Signer": {
    "id": "uuid",
    "email": "string",
    "name": "string",
    "role": "signatory|proposer|validator|witness",
    "signing_order": 1,
    "viewed_at": "date-time|null",
    "signed_at": "date-time|null",
    "declined_at": "date-time|null"
  },
  "Field": {
    "id": "uuid",
    "signer_id": "uuid",
    "kind": "signature|initials|date|text|checkbox|email",
    "page": 1,
    "x": 0.1,
    "y": 0.1,
    "width": 0.2,
    "height": 0.05,
    "required": true
  }
}
```

`Signer` omits `access_token_hash`, image paths, and any URL that contains a token. `Envelope` omits storage paths.

### Read (M1) — scope `envelopes:read`

**`envelopes_list`** → `EnvelopesService.list`. `readOnlyHint: true`.

Input: `{ "status"?: string[], "limit"?: number, "cursor"?: string, "q"?: string, "tags"?: string }`. Same filters as `GET /envelopes`. `q` is a case-insensitive substring of `title` and `short_code` only (`ListFilters.q`). `limit` max 50.

Output: `{ "items": ["Envelope summary without fields"], "next_cursor": "string|null" }`.

**`envelopes_search`** → new `EnvelopesService.search`, which starts from `EnvelopesRepositoryPg.list` and adds the filters that list does not have. Scope `envelopes:read`. `readOnlyHint: true`. This is the tool agents use to find a document.

Input:

```json
{
  "title": "string, optional, substring",
  "signer": "string, optional, substring of signer name or email",
  "status": ["draft|awaiting_others|sealing|completed|declined|expired|canceled"],
  "date_from": "date-time, optional, inclusive",
  "date_to": "date-time, optional, exclusive",
  "template_id": "uuid, optional",
  "drive_file_name": "string, optional, substring",
  "limit": 20,
  "cursor": "string, optional"
}
```

All set fields are AND-combined. `limit` max 50.

Output: `{ "items": [{ "id", "title", "status", "updated_at", "signers": [{ "id", "name", "email", "status" }] }], "next_cursor": "string|null" }`.

What the code does today, and what this tool adds:

| Filter | Today | Index |
| --- | --- | --- |
| Title | `list` already applies `lower(title) like` and `lower(short_code) like`, after `owner_id =`. | Leftmost column of `envelopes_owner_status_updated_idx` (`0002_envelopes.sql`) bounds the owner. Title stays a residual predicate. No new title index in this PR. |
| Status | `list` filters `e.status`. | Same index: `(owner_id, status, updated_at desc)`. |
| Date range | `list` uses a half-open window on `updated_at` (`DateWindow`). The tool maps `date_from` / `date_to` onto that window. | Same index, `updated_at` is the third column. |
| Signer name or email | `list` accepts exact `signerEmails` only (`lower(email) in (...)`), not a name substring. | `envelope_signers` is unique on `(envelope_id, email)` and has `envelope_signers_envelope_signed_idx` on `(envelope_id, signed_at)`. The search method joins signers for the owner’s envelope ids and applies `lower(name) like` or `email like`. Email is `citext`. A new `(email)` index is not required for a substring match. |
| Template | No `source_template_id` column yet. | This tool’s migration (next free id, not `0020`) adds nullable `envelopes.source_template_id` and index `(owner_id, source_template_id)`. The column stays null until the `templates_use` PR sets it. A filter on a null column returns no rows. |
| Drive file name | The source file name is not stored. `gdrive_envelope_exports.folder_name` is the destination folder of a save, not the file that was imported. | The same migration adds nullable `envelopes.source_drive_file_name`. The import PR writes it. Until then the filter matches nothing. The tool does not call Google. `drive.file` cannot search the user’s whole Drive. Indexes on `gdrive_envelope_exports` stay `(envelope_id)` and `(account_id)` (`0017`). |

**`envelopes_status`** → `EnvelopesService.getById` (`findByIdForOwner`), which already loads `envelope_signers`. Scope `envelopes:read`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid" }`.

Output:

```json
{
  "envelope_id": "uuid",
  "title": "string",
  "status": "awaiting_others",
  "sent_at": "date-time|null",
  "completed_at": "date-time|null",
  "expires_at": "date-time",
  "signers": [
    {
      "id": "uuid",
      "name": "string",
      "email": "string",
      "status": "sent|viewed|signed|declined",
      "sent_at": "date-time|null",
      "viewed_at": "date-time|null",
      "signed_at": "date-time|null",
      "declined_at": "date-time|null"
    }
  ],
  "pending_signers": [{ "id": "uuid", "name": "string", "email": "string" }],
  "next_action": "remind|wait|download|none",
  "can_remind_at": "date-time|null"
}
```

`next_action` is `remind` when someone is still pending and the one-hour rule allows it, `wait` when the rule does not, `download` when the envelope is `completed`, and `none` otherwise. `can_remind_at` is the earliest time `envelopes_remind` would pass the one-hour guard, or null when a remind is allowed now or there is nobody to remind.

Signer `status` is derived from columns, in this order, extending `deriveSignerStatus` in `envelopes.repository.pg.ts` (which returns `declined`, `completed`, `viewing`, `awaiting`):

| Tool status | Columns |
| --- | --- |
| `declined` | `declined_at` is set |
| `signed` | `signed_at` is set (`deriveSignerStatus` calls this `completed`) |
| `viewed` | `viewed_at` is set and the signer has not signed or declined |
| `sent` | `access_token_sent_at` is set (or the envelope `sent_at` is set) and `viewed_at` is null |

`pending_signers` is every signer on that envelope with `signed_at` null and `declined_at` null. Lookup is the envelope primary key plus signers by `envelope_id` (`envelope_signers_envelope_signed_idx`). No token fields.

**`envelopes_list_pending`** → new `EnvelopesRepository.listPendingSigners`, wrapped by `EnvelopesService`. Scope `envelopes:read`. `readOnlyHint: true`.

Input: `{ "limit"?: number, "cursor"?: string }`. `limit` max 50.

Output: `{ "items": [{ "envelope_id", "title", "envelope_status", "signer_id", "name", "email", "sent_at", "viewed_at" }], "next_cursor" }`.

Query: envelopes with `owner_id` and `status = 'awaiting_others'` via `envelopes_owner_status_updated_idx`, joined to `envelope_signers` where `signed_at` is null and `declined_at` is null. `envelope_signers_envelope_signed_idx` on `(envelope_id, signed_at)` supports that null `signed_at` range per envelope. Ordered by `envelopes.updated_at desc`, `signer id`.

**`envelopes_get`** → `EnvelopesService.getById`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid" }`. Output: `Envelope`.

**`envelopes_list_events`** → `EnvelopesService.listEvents`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid", "limit"?, "cursor"? }`. Output: `{ "events": [{ "id", "event_type", "actor_kind", "signer_id", "created_at", "metadata" }], "next_cursor" }`. Metadata may include the MCP attribution object defined below. It does not include tokens.

**`envelopes_download_url`** → `EnvelopesService.getDownloadUrl`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid", "kind"?: "sealed"|"original"|"audit" }`. Output: `{ "url": "string", "kind": "sealed"|"original"|"audit", "expires_in_seconds": 300 }`. `EnvelopesService.getDownloadUrl` already calls `createSignedUrl(path, 300)` (`envelopes.service.ts`). MCP does not ask for a longer life. The tool description says the link expires in five minutes, and that document content and signer data returned to the MCP client are processed by the customer’s own AI or agent provider. That provider is not a Seald sub-processor (Privacy P2, DPA §2.1). The URL is not a signer token. Do not put it in a webhook or a prompt log.

**`me_get`** → the authenticated user id and email already on `AuthUser` (the same facts as `GET /me`), plus the credential’s scopes, approval mode, and remaining quotas. `readOnlyHint: true`. No scope beyond a valid credential. Output: `{ "id", "email", "scopes": ["envelopes:read"], "require_owner_approval": true, "quotas": { "sends_remaining": 20, "new_recipients_remaining": 25, "email_copies_remaining": 50 } }`.

### Prepare an envelope (M2) — scope `envelopes:write`

**`envelopes_create`** → `EnvelopesService.createDraft`.

Input: `{ "title": "string (1–200)", "idempotency_key"?: "string" }`. Output: `Envelope`. Writes event `created` with `actor_kind: sender`.

**`envelopes_update`** → `EnvelopesService.patchDraft`.

Input: `{ "envelope_id", "title"?, "expires_at"?, "tags"?, "idempotency_key"? }`. Tags follow `PatchEnvelopeDto` (max 10, 32 chars). Drafts only (`envelope_not_draft`).

**`envelopes_delete_draft`** → `EnvelopesService.deleteDraft`. `destructiveHint: true`.

Input: `{ "envelope_id", "idempotency_key"? }`. Output: `{ "deleted": true }`. Sent envelopes use cancel, not delete.

**`envelopes_upload_pdf`** → `EnvelopesService.uploadOriginal`.

The JSON parser stops at 1 MB (`main.ts`), and a 25 MB PDF does not fit in a tool argument. The tool does not take base64.

The upload migration (next free id, its own PR) adds `mcp_uploads`:

```sql
create table public.mcp_uploads (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  storage_key  text not null,
  sha256       text not null,
  byte_length  integer not null,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
```

RLS on, no policies.

Flow:

1. Client `POST /mcp/uploads` as `multipart/form-data` field `file`, same MCP credential, multer limit 30 MB, service limit 25 MB (same numbers as `POST /envelopes/:id/upload`).
2. The handler stores the bytes with `StorageService` at `mcp-uploads/<owner_id>/<id>` and inserts an `mcp_uploads` row with `expires_at` 15 minutes out. Response: `{ "upload_id", "sha256", "byte_length" }`.
3. Tool input: `{ "envelope_id", "upload_id" }`. The handler loads the row for that owner, rejects it when `consumed_at` is set or `expires_at` has passed, calls `uploadOriginal`, sets `consumed_at`, then deletes the object. A cleanup pass deletes expired unconsumed rows. The cleanup owner is this worker loop, not a new process.

Output: `{ "pages": number, "sha256": "string" }`. Event `pdf_uploaded` is the one `uploadOriginal` already appends.

Drive-sourced PDFs skip this route; see `gdrive_import_as_pdf` in M5.

**`envelopes_add_signer`** → `EnvelopesService.addSigner` with `AddSignerDto`.

Input: either `{ "envelope_id", "contact_id" }` or `{ "envelope_id", "email", "name", "color"? }`. Output: `Signer`. Duplicate email on the envelope is `signer_email_taken`.

**`envelopes_remove_signer`** → `EnvelopesService.removeSigner`. `destructiveHint: true`.

Input: `{ "envelope_id", "signer_id" }`. Output: `{ "removed": true }`.

### Fields and send (M3) — scopes `envelopes:write` and `envelopes:send`

**`envelopes_suggest_fields`** → new pure function `suggestFields` in `apps/api/src/mcp/suggest-fields.ts`. No writes. Scope `envelopes:read`. `readOnlyHint: true`.

There is no auto-placement service today. The editor snaps to other fields in the browser (`useFieldMutations.ts`); that code does not run on the server.

Input: `{ "envelope_id", "signer_id"? }`. The function reads `original_pages` and the current signers. It returns suggestions and does not call `replaceFields`.

Heuristic, v1:

- One required `signature` per signer on the last page, stacked upward from `y = 0.78`, `x = 0.1`, `width = 0.28`, `height = 0.06`.
- A `date` field on the same row, to the right of that signature.
- If `original_pages > 1`, optional `initials` on pages `1 .. n-1` at the bottom right. `required: false` so send’s “every signer has a required signature or initials” rule is satisfied by the signature alone.
- Suggestions that would overlap an existing field are shifted up by `0.08`, and dropped if they would leave the page.

Output: `{ "fields": ["Field without id"], "note": "Suggestions only. Call envelopes_place_fields to save." }`.

**`envelopes_place_fields`** → `EnvelopesService.replaceFields`. Scope `envelopes:write`.

Input: `{ "envelope_id", "fields": [FieldPlacement] }`. This replaces the whole set, same as `PUT /envelopes/:id/fields` (`ArrayMaxSize(500)`). Draft only. Every `signer_id` must belong to the envelope.

**`envelopes_preview_send`** → the checks at the start of `EnvelopesService.send`, without `sendDraft`. Scope `envelopes:send`. `readOnlyHint: false`, `destructiveHint: false`. It writes a confirmation row, so it is not read-only.

Checks: file present, at least one signer, at least one field, every signer has a required `signature` or `initials` field. On success the server stores a confirmation row and returns a token, and it opens an in-app approval when the key requires one.

Input: `{ "envelope_id" }`.

Output:

```json
{
  "ready": true,
  "summary": {
    "title": "string",
    "signers": [{ "name": "string", "email": "string", "signer_is_account_owner": false }],
    "field_count": 0,
    "expires_at": "date-time",
    "file_sha256": "string"
  },
  "signer_is_account_owner": false,
  "approval": "in_app",
  "approval_id": "uuid|null",
  "confirmation_token": "string",
  "expires_in_seconds": 600
}
```

When any signer email equals the account email, `signer_is_account_owner` is true and the summary includes: “You are a signer. You must open the link and sign yourself; the agent must not sign for you.”

The token is 32 random bytes, base64url. The table stores only its SHA-256. Columns include `owner_id`, `api_key_id` or `oauth_grant_id`, `tool`, `envelope_id`, `subject_hash`, `token_hash`, `expires_at`, `consumed_at`. `subject_hash` is SHA-256 of canonical JSON of the facts the preview showed: title, `original_sha256`, `expires_at`, each signer’s email and name, field ids, the tool name, and the tool arguments (for remind, `signer_id`; for Drive save, `folder_id`). The row is bound to that credential. TTL 10 minutes.

Consume is one statement in the same transaction that locks the envelope: `select … from envelopes where id = $1 for update`, recompute `subject_hash`, then `update mcp_confirmations set consumed_at = now() where token_hash = $2 and api_key_id = $3 and consumed_at is null and expires_at > now() returning id`. A second caller gets no row.

The token proves that a preview of this exact envelope was generated within the last 10 minutes and that the envelope hasn't changed since. It does not by itself prove that a human saw it. Hosts should show `summary` to the person and call the mutating tool only after that person agrees. Legally, the account owner is bound by sends made with their credential either way (ESIGN § 7001(h); UETA §§ 9, 14). The confirmation step is an error-prevention control, not evidence of the owner's intent.

**`envelopes_send`** → `EnvelopesService.send`, only after the approval rule below. Scope `envelopes:send`. `openWorldHint: true`.

Input: `{ "envelope_id", "confirmation_token", "idempotency_key"? }`.

Each key and grant has `require_owner_approval`, default true. Only a Supabase session can set it to false. No tool argument can.

- When it is true, the tool returns `{ "status": "approval_pending", "message": "pending owner approval", "approval_id" }` and does not call `sendDraft`. That result is success, not an error. The server emails the owner and, after the owner posts Approve, the server runs the action. The agent does not send. It polls `approvals_get` until the status is `done`, `denied`, or `expired`.
- Setting the flag to false is the unattended opt-in, behind a warning sheet quoting Terms §4.1. Daily caps still apply.
- Even then, a signer email that is not already in the owner’s contacts or on an earlier envelope of that owner falls back to approval. The only exception is `allow_new_recipients`, also set only in the SPA.
- An edit to the draft after the approval request changes `subject_hash` and the request can no longer be approved.

Remind, cancel, and save-to-Drive use the same default. MCP elicitation is not the approval path: the v1 transport is stateless and has no server-to-client channel.

The tool result after approval is the `Envelope` with status `awaiting_others`. It does not include `sign_url`. Send must not run until the plaintext-token PR (below) has removed `?t=` from `outbound_emails.payload`.

**`approvals_get`** → reads the approval row for this owner. Scope `envelopes:read`. `readOnlyHint: true`. Input `{ "approval_id" }`. Output `{ "status": "pending|done|denied|expired" }`. The agent cannot set the status. `done` means the server already ran the action.

**`envelopes_remind`** → `EnvelopesService.remindSigner`. Scope `envelopes:send`. `openWorldHint: true`.

Preview tool `envelopes_preview_remind` with `{ "envelope_id", "signer_id" }` returns the signer name and email plus a confirmation token. Send tool input adds `confirmation_token`. The one-per-hour guard stays (`remind_throttled`, 429). The tool result is `{ "status": "queued" }`, matching the controller’s 202 body. The reminder email is still rendered by `TemplateService` kind `reminder` and drained by `EmailWorkerService`.

**`envelopes_cancel`** → `EnvelopesService.cancel`. Scope `envelopes:send`. `destructiveHint: true`, `openWorldHint: true`.

Preview tool names the envelope and says withdrawal emails will go out. Input adds `confirmation_token`. Allowed from `awaiting_others` or `sealing`, same as the service. Output: `{ "status": "canceled" }`.

### Templates and contacts (M4)

**`contacts_list` / `contacts_get` / `contacts_create` / `contacts_update` / `contacts_delete`** → `ContactsService`. Read vs write scopes as named. Delete is `destructiveHint: true`.

Create input matches `CreateContactDto`: `name` (1–200), `email`, `color` (`#RRGGBB`). Output is the contact row (`id`, `name`, `email`, `color`).

**`templates_list` / `templates_get` / `templates_create` / `templates_update` / `templates_delete`** → `TemplatesService`.

Create and update pass the existing DTOs. `field_layout` entries use template types `signature | initial | date | text | checkbox` and `pageRule` `all | allButLast | first | last | <page number>` (`packages/shared/src/templates.ts`). That is a different spelling from envelope field kind `initials`. The use-tool maps `initial` → `initials`.

**`templates_use`** → `TemplatesService.use`, then `EnvelopesService.replaceFields`. Scope `templates:read` + `envelopes:write`.

Input: `{ "template_id", "envelope_id" }`. The envelope must be a draft with a known `original_pages` and at least one signer. The tool:

1. Calls `use`, which bumps `uses_count` and `last_used_at`.
2. Expands each `field_layout` entry across pages using `pageRule` and `original_pages`. A numeric page past the end of the PDF is skipped.
3. Assigns fields to signers in list order, matching `last_signers` by email when the emails line up, otherwise the first signer.
4. Calls `replaceFields` with the expanded list.

Output: `{ "template_id", "uses_count", "fields": ["Field"] }`. If the template has no layout, the tool returns `template_has_no_fields` and does not bump use. (Implementation detail to confirm in the PR: bump only after a successful replace, so a failed replace does not count as a use.)

**`templates_attach_example`** uses the same staging upload as `envelopes_upload_pdf`, then `TemplatesService.attachExamplePdf`. Scope `templates:write`.

### Google Drive (M5) — flag `gdriveIntegration` must also be on

If Drive is off, these tools are omitted from `tools/list`. Scope does not bypass `GDriveController.requireFlag`.

**`gdrive_list_accounts`** → `GDriveService.listAccounts`. `gdrive:read`, `readOnlyHint: true`. Output: `{ "accounts": [{ "id", "google_email", "connected_at" }] }`. Soft-deleted rows are omitted. Tokens are not returned.

**`gdrive_connect_url`** → `buildConsentUrl` / the same URL `GET /integrations/gdrive/oauth/url` returns. `gdrive:read`.

Output: `{ "url": "string", "note": "Open this URL in a browser. The agent cannot approve Google’s consent screen." }`. The human finishes OAuth. The agent then calls `gdrive_list_accounts`.

**`gdrive_disconnect`** → `GDriveService` delete used by `DELETE /integrations/gdrive/accounts/:id`. `gdrive:write`, `destructiveHint: true`. Requires a confirmation token from `gdrive_preview_disconnect`.

**`gdrive_list_files`** → the files proxy behind `GET /integrations/gdrive/files`. `gdrive:read`, `readOnlyHint: true`.

Input: `{ "mime"?: "pdf"|"doc"|"docx"|"all" }`. Output is the proxy’s file list (`id`, `name`, `mimeType`, `modifiedTime`, `size`).

This list is only files the `drive.file` scope already allows: files the user picked with Google’s picker, or files this app created. It is not a search of the user’s whole Drive. The tool description says so, so the agent does not ask for a broader scope.

**`gdrive_import_as_pdf`** → conversion controller + `uploadOriginal`. `gdrive:read` and `envelopes:write`.

Input: `{ "envelope_id", "file_id" }`. PDF files are fetched and passed to `uploadOriginal`. `doc` / `docx` go through `ConversionService` (Gotenberg, `GDRIVE_GOTENBERG_URL`, size cap `GDRIVE_CONVERSION_MAX_BYTES`). The tool waits up to 25 seconds, inside the 30 second request timeout, and returns `{ "pages", "sha256" }` or `conversion_pending` with a `job_id` the client can poll via `gdrive_conversion_status` → `GET /integrations/gdrive/conversion/:jobId`.

**`envelopes_save_to_drive`** → `EnvelopesService.saveToGoogleDrive` → `GdriveExportService.exportEnvelope`. `gdrive:write`. `openWorldHint: true`.

Preview returns folder id, folder name, and file names. Input: `{ "envelope_id", "folder_id", "folder_name"?, "confirmation_token" }`. The folder must already be one the app can write (picker selection or a folder the app created). The service refreshes the Drive token, updates files in place when `gdrive_envelope_exports` already has ids for that folder, and maps errors the way `mapGdriveSaveError` does (`gdrive_not_connected`, `token-expired`, `rate-limited`, `permission-denied`, `drive-upstream-error`). Partial success stays a tool error slug `gdrive_partial` plus the file ids that landed, matching the HTTP 207 behavior.

The default folder is “My Drive / Seald”. If `folder_id` is omitted, the service creates that folder when it does not already exist (the app creates it, so `drive.file` can write it) and saves there. A different folder is an Advanced choice in the SPA. The agent cannot open the Google Picker.


### Approvals — scope `envelopes:read` to list, and the owner’s session to decide

**`approvals_list`** → requests for this owner. `readOnlyHint: true`. Input `{ "status"?: "pending|done|denied|expired", "limit"?, "cursor"? }`. Output `{ "items": [{ "approval_id", "tool", "status", "requested_at", "expires_at" }], "next_cursor" }`. A pending row whose `expires_at` has passed is returned as `expired`.

**`approvals_get`** already described above is the single-row read. There is no `approvals_decide` tool. The agent cannot Approve or Deny. The server runs the action after a valid POST.

Resource `seald://approvals/pending` is the first page of `approvals_list`.

### Bulk, templates, contacts, Drive search, and signer fixes

These ship in the later pull requests named in the plan. Until that PR they are absent from `tools/list`.

**`envelopes_bulk_send_from_template`** → one envelope per row, one approval for the batch. Scope `envelopes:send` plus `templates:read`. Input `{ "template_id", "rows": [{ "title", "signers", "prefill"? }], "idempotency_key", "dry_run" }`. At most 25 rows. Each row counts as one send and its new addresses count toward the recipient cap. Over the cap, the call fails and writes nothing. Output on the approval path: `{ "status": "approval_pending", "approval_id", "batch_id" }`.

**`batches_get`** → `{ "batch_id" }`. Output `{ "batch_id", "status", "rows": [{ "title", "envelope_id", "status", "slug"? }] }`. `readOnlyHint: true`.

**`envelopes_create_from_template`** → create a draft, apply the layout, add the signers, prefill text and date fields. Scope `templates:read` and `envelopes:write`. `initial` in the template maps to envelope kind `initials`. `uses_count` increments only after the draft, the signers, and the fields all commit. Prefill values that do not match a text or date field are `prefill_unknown_field`.

**`templates_get_schema`** → `readOnlyHint: true`, scope `templates:read`. Output `{ "template_id", "fields": [{ "kind", "label", "required", "page_rule" }] }` so an agent can build a row without guessing.

**`contacts_search`** → substring of name or email, with `cursor`. Scope `contacts:read`.

**`contacts_import`** → upsert by email. Scope `contacts:write`. Input `{ "rows": [{ "name", "email", "color"? }], "idempotency_key", "dry_run" }`. Cap 100 rows. Output `{ "rows": [{ "email", "status": "created|updated|error", "slug"? }] }`. One bad row does not roll back the others. The idempotency key covers the whole call.

**`gdrive_search_files`** → `gdrive:read`, `readOnlyHint: true`. Input `{ "q", "limit"?, "cursor"? }`. Same file set as `gdrive_list_files`: files the user picked or this app created. The description says `drive.file` cannot search the rest of the user’s Drive. `q` is a substring of the name. It does not add a Google scope.

**`envelopes_fix_signer`** → correct a name or email and re-invite, only through approval. Scope `envelopes:send`. Refused with `signer_already_signed` when `signed_at` is set. The previous invite stops working because the token hash from the plaintext-token pull request no longer matches.

**`envelopes_change_expiry`** → new `expires_at` on a sent envelope, through approval. Scope `envelopes:send`. Drafts keep using `envelopes_update`.

### Automations (after the webhook action exists)

Same `AutomationsService` as the settings API. `automations:write` is off by default. Creating or enabling a recipe with an external destination returns `approval_pending` and stays disabled until the owner approves.

| Tool | Notes |
| --- | --- |
| `automations_list` | Cursor. No secrets. |
| `automations_upsert_recipe` | External URL, extra recipients, or a Drive folder need owner approval. |
| `automations_set_enabled` | Enabling an external recipe needs the same approval. |
| `automations_list_runs` | Cursor. Status words are Done, Failed, Retrying, Off, Expired. |
| `automations_get_run` | One run, including the plain-language failure and whether Retry is allowed. |
| `automations_retry_run` | Re-enqueues that run id. Refuses a permanent failure with `retry_not_allowed`. |
| `automations_test_webhook` | Signed sample, same address checks and 10 second timeout. `type` is `automation.test`. Not stored as a run. |

## Resources and prompts

Resources are read-only views over the same services. URIs:

| URI | Body |
| --- | --- |
| `seald://guide` | Lifecycle, the rule that agents never sign, how approval works, and the daily caps (20 sends, 25 new recipients, 50 email copies). |
| `seald://envelopes` | JSON list, first page, no cursor loop inside the resource. |
| `seald://envelopes/{id}` | `envelopes_get` payload. |
| `seald://envelopes/{id}/events` | Event list, first page. |
| `seald://contacts` | Contact list, first page. |
| `seald://templates` | Template list, first page, including `field_layout` and `last_signers`. |
| `seald://approvals/pending` | First page of `approvals_list`. |
| `seald://account` | `me_get`, including scopes, approval mode, and quotas. |

Unknown ids return a resource error with slug `envelope_not_found` or `contact_not_found`, not an empty document.

Prompts (no side effects; they return messages that tell the model which tools to call):

**`prepare-and-send`** — “Prepare and send for signature.”

Arguments: `title`, `signer_emails` (array of `{name, email}`), optional `template_id`, optional `source` (`upload` or `drive_file_id`).

Message body, in short:

1. Create the envelope. Attach the PDF via upload or Drive import.
2. Add signers. Create contacts only if the user asked to save them.
3. If `template_id` is set, `templates_use`. Otherwise `envelopes_suggest_fields`, show the suggestion, then `envelopes_place_fields` after the user accepts the placement.
4. `envelopes_preview_send`. Show the summary. The owner approves in Seald. The token alone is not approval.
5. `envelopes_send` returns “pending owner approval”. Poll `approvals_get` until it says `done`. If `require_owner_approval` is already false and every recipient is already known, send may proceed in the same turn. The agent never turns that flag off.
6. Report status, signer names, and the verify path `/verify/{short_code}`. Do not include a signing link.

**`status-check`** — argument `envelope_id` or `query`. Tells the model to call `envelopes_search` or `envelopes_status`, then summarize who has viewed or signed. Read-only.

**`first-send`** — arguments `title` and `signer_emails`. Same steps as `prepare-and-send`, and it stops on `approval_pending` instead of sending again.

**`bulk-send`** — argument `template_id` plus rows. Tells the model to call `templates_get_schema`, then `envelopes_bulk_send_from_template` once, then poll `batches_get`. One approval covers the batch.

**`chase-overdue`** — no required arguments. Tells the model to call `envelopes_list_pending`, then `envelopes_status` for `can_remind_at`, then `envelopes_remind` only when a remind is allowed. A `remind_throttled` error is the stop, not a second try.

## Human confirmation, and the signer’s own act

The confirmation token stops a wrong document from going out. It is not the owner’s agreement, and it is not the signer’s agreement.

`envelopes_preview_send` returns a one-time token bound to `subject_hash`. `envelopes_send` requires that token. The token is consumed only in the same transaction that calls `send`, with `SELECT … FOR UPDATE`. A second caller gets `confirmation_invalid`.

Default `require_owner_approval` is true. Every request emails the owner. The link opens a standalone page, and the single-use token is the second factor. No login. Turning the flag off is an explicit per-key choice, and only a session on the Developers page can do it. The first time a key emails someone, the send falls back to approval even if the flag is off.

The agent prepares. The signer signs. There is no signing tool.

The signer’s path is unchanged, except the signing token is no longer stored in `outbound_emails.payload`. A prerequisite PR, before any send tool, stores `token_hash` (SHA-256 of the raw token) and drops `?t=` from `payload`. `EmailDispatcherService` rebuilds the link at send time. Account deletion already deletes outbound rows. Until that PR is merged, send tools stay out of `tools/list`.

`POST /sign/start` still exchanges the link token for cookie `seald_sign`. Then `accept-terms`, `esign-disclosure`, `intent-to-sign`, and `submit` or `decline`. That sequence records intent and the ESIGN disclosure (`ESIGN_DISCLOSURE_VERSION` in `packages/shared/src/compliance.ts`, currently `esign_v0.3`). Code review for every MCP PR checks that `src/mcp` does not import `signing.service.ts` or `signer-session.service.ts`.

If the authenticated MCP identity is the same person as a signer on the envelope, send and remind for that person return `agent_is_signer`. The owner must send from the SPA, or remove that signer from the MCP draft.

`SIGNATURE_LEVEL_NOTE` stays on the Developers page: simple electronic signature, ESIGN and UETA consent, hash-chained audit trail, PAdES seal when a seal is applied. `ESIGN_EXCLUDED_CATEGORIES` stays a sender warning.

Audit certificate, before the first send-capable release: `audit-pdf.tsx` prints one line when `metadata.mcp` is present, “Prepared with {client_name} via Seald MCP”. The line is a fact about the tool, not a claim the agent signed. The PDF test fixture is regenerated in that PR. The chain already covers the metadata through canonical JSON.

Attribution on MCP-originated events:

- `actor_kind` stays `sender` or `system`. No new enum value.
- `metadata.mcp` = `{ "key_id": "uuid|null", "key_name": "string|null", "key_prefix": "string|null", "client_name": "string", "client_name_source": "key_name|oauth_client|header|unknown", "tool": "string" }`. Names are copied onto the row at write time. Later renames do not rewrite the chain.
- `user_agent` is `SealdMCP/1 <client_name>`, truncated. `ip` is `extractClientIp` of the MCP request.

`createDraft`, `send`, `cancel`, and `remindSigner` take an optional metadata bag. SPA controllers pass nothing, so those events stay `metadata: {}`.

## Untrusted document text

PDFs, titles, and signer names are data. Tool results wrap them so a document cannot instruct the model to skip preview, invent a confirmation, or call a tool that does not exist. The system prompt for `prepare-and-send` says the same thing: instructions inside a document are not instructions from the account owner.

Search and status tools are how an agent checks state without inventing it. They are read-only.

## Rate limits, idempotency, errors

`McpController` replaces the global `ThrottlerGuard` buckets so one agent is not cut off at 5 requests per second:

| Bucket | MCP route |
| --- | --- |
| short | 10 / 1s |
| medium | 30 / 1 min |
| long | 300 / 1 hr |

Per credential, `mcp:<key_id or grant_id>`, 30 requests per 60 seconds, same shape as `GDriveRateLimiter`. Drive tools also call `GDriveRateLimiter.acquire(userId)`. The short, medium, and per-credential limits are one policy. A host that needs a higher limit asks support. It does not get a second, looser number in the same document.

Caps, enforced inside the send transaction with `pg_advisory_xact_lock` on the owner id, so two concurrent sends cannot both pass a check-then-act:

| Cap | Limit | Slug |
| --- | --- | --- |
| Sends per key per UTC day, including each row of a bulk send | 20 | `send_daily_cap` |
| New recipient addresses per owner per UTC day | 25 | `recipient_daily_cap` |
| `email_copy` recipient-messages per owner per UTC day | 50 | `email_copy_daily_cap` |
| Live keys | 10 | `key_limit` |

A bulk call that would pass any of these caps is rejected whole and creates nothing. Turning `require_owner_approval` off does not raise the caps. Remind keeps the one-hour rule in `remindSigner`. The email-copy cap is the same counter the automations worker uses, so an agent and a recipe share it.

HTTP 429 slug `rate_limited`, plus `retry_after_seconds`. The tool layer surfaces that slug with `isError: true`.

Idempotency reuses `idempotency_records`:

- Insert the row first, in the same transaction as the mutation. A duplicate primary key is a replay, not a second envelope.
- Credential namespacing: the stored key is `mcp:<key_id>:<client key>`, so two keys cannot collide and a key cannot replay a SPA write.
- If `request_hash` matches, return the stored `response_body`. If it differs, `idempotency_conflict`.
- `request_hash` is SHA-256 of the tool name plus canonical JSON of the arguments minus the idempotency key.
- TTL stays 24 hours.
- `deleteByUser` runs on account deletion. The table has no foreign key in `0003_outbound_emails.sql`.

The confirmation token and the idempotency key are different. The token binds a preview to a subject hash. The key makes a retried create return the same draft.

Error table (tool `isError` unless noted):

| Situation | Slug | HTTP |
| --- | --- | --- |
| Flag off or `MCP_DISABLED` | `not_found` | 404 |
| Missing or bad credential | `missing_token` / `invalid_token` / `api_key_revoked` / `api_key_expired` | 401 |
| Scope missing | `insufficient_scope` | 200 tool error |
| Confirmation missing, used, expired, or subject changed | `confirmation_required` / `confirmation_invalid` | 200 tool error |
| Waiting on the owner | `approval_pending` | 200 tool result, not an error |
| Agent identity is a signer | `agent_is_signer` | 200 tool error |
| Daily cap | `send_daily_cap` / `recipient_daily_cap` | 200 tool error |
| Service `HttpException` | existing slug | 200 tool error |
| Upload route, no file | `file_required` | 400 |
| JSON-RPC parse or unknown method | JSON-RPC `-32700` / `-32601` | 200 or 400 as the transport requires |
| Unexpected throw | `internal_error` | 500, no bearer token in the log |

Log tool name, owner id, key id, slug, and duration. Do not log argument values that might contain a token.

## Personal data

Account deletion already removes envelopes, events, contacts, and outbound mail for that user. The MCP PR adds the new tables to `deleteAccountData`: `api_keys`, `mcp_oauth_grants`, `mcp_send_approvals`, `mcp_uploads`, `mcp_action_confirmations`, and idempotency rows. Object storage for staging uploads is deleted in the same path.

A download URL inside a tool result is covered by the same access rules as `GET /envelopes/:id/sealed`. The privacy notice names the model host as a recipient only when the user connects one. Seald does not send document bytes to a model vendor.

Legal text for the terms, privacy notice, DPA, and acceptable-use policy is in [Legal text](#legal-text). Version bumps are `terms_v0.4`, `privacy_v0.4`, `dpa_v0.4`, `aup_v0.3`, `sub_processors_v0.4`, in the same compliance PR as the settings copy, before the flag defaults to on.

## Settings UI

Concept A, with the v2 rule: minimal copy, one or two taps for the main task, and extra fields behind “Advanced”. One column, 720px cap, the same component tree at desktop and phone. No new `NAV_ITEMS` row. The words to use are “settings index row” and “user-menu row”.

Status words everywhere in this UI are Done, Failed, Retrying, Off, and Expired. Do not show Queued or Sent.

| Route | Who | What |
| --- | --- | --- |
| `/settings` | Desktop, inside `AppShell` | Short index: Integrations, Automations, Developers. Rows appear only when that feature’s flag is on. Replaces today’s redirect to integrations. |
| `/m/settings` | Phone, outside `AppShell` | Same index. One drawer row, “Settings”, opens it. Drive stays at `/m/send/settings`. The drawer does not gain Automations and Developers as extra rows. |
| `/settings/developers` | Desktop | The Developers page. |
| `/m/settings/developers` | Phone | The same page component. |

`/settings/` and `/m/` are already SPA prefixes. New paths still need a real `AppRoutes.tsx` route so `spa-worker-routes.contract.test.ts` stays valid.

The page:

1. Title “Developers”. One sentence: keys let an app prepare and send on your behalf. Signers still sign from their own link. `SIGNATURE_LEVEL_NOTE` sits behind “Advanced”.
2. Empty state: “New key”. One tap creates the key. The server names it `Key N` (the next free N for that owner). Scope is `envelopes:read` only. Expiry is 90 days. There is no Never option. The API rejects a null expiry and any expiry more than 365 days out.
3. “Advanced” on that create opens name, scope checkboxes, and expiry. Templates, contacts, and Drive read stay off until tapped. Send stays off until tapped. Expiry choices are 30, 90, and 365 days. 90 is selected. 365 is the maximum.
4. Under the list, “Connect a client”: server URL with Copy, snippets for Claude Code and Cursor with `<YOUR_KEY>` only. ChatGPT and Claude app tiles say “Later”. They are not a key flow.
5. Key list, up to 10 live keys: name, prefix, expiry. A key past `expires_at` shows Expired. Revoke is on the row. Last used and scope labels sit behind “Advanced”. “Agent activity” is a later PR.
6. Show-once sheet, shared `SecretOnceSheet`: the full `seald_live_…` value and Copy. No checkbox and no “I saved it” step. Closing drops the value. The snippet may contain the key only while the sheet is open.
7. Revoke asks once, focus on Cancel.
8. After the OAuth pull request: “Connected apps”. Empty until a grant exists. Until then the ChatGPT and Claude tiles stay “Later”.

Flag off: the settings index row is omitted. Direct visits get the not-available state the Drive page uses, not a broken form.

API (session JWT only):

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/me/api-keys` | List without hashes. |
| `POST` | `/me/api-keys` | `{}` creates `Key N`, scope `envelopes:read`, expiry 90 days, and returns `secret` once. Advanced fields: `name`, `scopes`, `expires_at` (required if sent; max 365 days; null is `validation_error`). |
| `POST` | `/me/api-keys/:id/revoke` | `{ revoked: true }`. |

These routes 404 when the flag is off or `MCP_DISABLED` is set. An API key cannot call them.

### Owner approval

Email is the primary channel. The in-app queue is secondary. The word on every approval surface is Deny, not Decline. Decline stays the signer’s word on `/sign`.

The approval row stores `link_token_hash` (SHA-256 of the raw token), `owner_id`, `action` (one of send, remind, cancel, save-to-drive, or the recipe change), `subject_hash`, `expires_at`, `approved_at`, and `denied_at`. The raw token is 32 random bytes, base64url, and it is never stored. It is single-use. It is bound to that one action and that owner. An edit to the envelope changes `subject_hash` and the token no longer matches, so the page shows expired. `expires_at` is 24 hours after create. `approved_at` or `denied_at` stamps the decision. A second POST finds one of those columns set.

Creating the row inserts one `outbound_emails` row, kind `approval_request`, to the account mailbox. `dedupe_key` is `approval_request:<approval_id>`, so a retry does not send a second mail. The template is `apps/api/src/email/templates/approval_request/` (`subject.txt`, `body.html`, `body.txt`), registered in `TemplateService` and in `TEMPLATE_KINDS` in `email-dispatcher.service.ts`. It uses the existing shell: the 560px card in `templates/_email.css`, the same masthead and legal footer as `invite` and `reminder`. The body is the document title, up to three recipient names and then “+N”, and the agent or key name. A large Approve button and a small Deny link both open the page. The line “Expires in 24h” sits under them. No document bytes, no recipient emails, no signing token, and no API key.

The link is `https://seald.nromomentum.com/approve/<token>`. `EmailDispatcherService` rebuilds it at send time. The outbox payload stores `link_token_hash`, not the raw token.

The page is the public route `/approve/:token`, outside `AppShell` and outside `RequireAuth`, the same idea as `/oauth/`. Add `/approve/` to `SPA_PREFIXES` in `apps/landing/_worker.js` and to the worker contract test. It does not redirect to `/m/send`. There is no login. The page is a logo and one card. The card’s one line is the document title, up to three recipient names then “+N”, and the agent and key name. It does not show document contents or recipient email addresses. While the row is open the card has Approve and Deny.

GET never acts. Mail prefetch must not approve. `GET /approvals/from-email/:token` returns the one-line summary and sets a `SameSite=Strict` CSRF cookie. It does not write `approved_at` or `denied_at`.

Approve and Deny are separate POSTs, `POST /approvals/from-email`, with the token, the decision, and the CSRF value in a hidden field. A POST missing the cookie or the field is `csrf_invalid` and does not decide. There is no session on this route. The emailed token is the second factor. On Approve the server sets `approved_at` and runs the action in that request (send, remind, cancel, or the recipe enable). The agent is not called back to finish it. On Deny the server sets `denied_at` and does not run the action.

Responses for the page and both API routes send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, and `Content-Security-Policy: frame-ancestors 'none'`. The HTML is `noindex`. GET and POST are rate limited per IP and per token (10 per minute).

After a decision, or when the link is opened again, the card shows one state:

| State | When |
| --- | --- |
| pending | The row is open and the token still matches. |
| done | `approved_at` is set. A repeat visit that was already approved shows done, not an error. |
| denied | `denied_at` is set. A repeat visit that was already denied shows denied. |
| expired | Past 24 hours, or `subject_hash` no longer matches because the envelope was edited. |

Deny also emails the owner, kind `approval_denied`, deduped on `approval_denied:<approval_id>`. That follow-up says the request was denied and offers one tap to Revoke the key. Revoke opens the signed-in Developers page (`/settings/developers` or `/m/settings/developers`) and still requires the Supabase session. The public page does not revoke.

The decision is written on the approval row and into the envelope audit metadata (`via: email|app`, action, key id). The raw token is not in the event.

The in-app queue stays at `/settings/approvals` and `/m/settings/approvals` for someone already signed in. Same four states. The bell badge counts `pending` rows. A toast names the document and opens the in-app card. In-app Approve and Deny are session POSTs and use the same server-side action.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/approvals?status=` | In-app list. Session required. |
| `GET` | `/approvals/:id` | In-app detail. Session required. |
| `POST` | `/approvals/:id/approve` | In-app Approve. Session required. Server runs the action when `pending`. |
| `POST` | `/approvals/:id/deny` | In-app Deny. Session required. Sets `denied_at`. |
| `GET` | `/approve/:token` | Public page. Logo and one card. Renders only. |
| `GET` | `/approvals/from-email/:token` | Summary plus CSRF cookie. Does not decide. |
| `POST` | `/approvals/from-email` | Approve or Deny. CSRF required. No session. |

#### Security trade-offs

The owner’s mailbox is the approval factor. Anyone who can read that mailbox can approve until the token expires. The mitigations in this design are the 24 hour expiry, the single-use binding to one action and one owner, the daily caps (20 sends, 25 new recipients, 50 email copies), the first-document-per-recipient rule (a new address falls back to approval even when the key is unattended), and the audit trail. Optional hardening is a later phase: require a signed-in session before an external-destination recipe or another high-risk approval can complete. That phase is not in step 7.

## Test plan

Contract tests, Jest, `apps/api/src/mcp/__tests__/tool-catalog.contract.spec.ts`:

- Every tool has a name, a schema that accepts a valid fixture, and a schema that rejects a missing required field.
- The catalog’s scope set matches this document. `envelopes:read` does not imply other read scopes.
- No tool name contains `sign`, `decline`, `submit`, or `disclosure`.
- The parity test lists every sender route as a tool or an exclusion. `require_owner_approval` has no tool.
- `src/mcp` does not import the signing module.
- Search and status tools are `readOnlyHint: true` and do not call a mutating service.

Service tests:

- Preview then in-app send does not call `send` until the owner approves.
- `unattended` with a first-time recipient does not call `send`.
- Send without a token does not call `send`.
- A second use of the token fails, including two concurrent callers.
- Patching the draft after preview changes `subject_hash` and the token fails.
- `metadata.mcp` on `created` includes `key_name` and `key_prefix`, and `verifyEventChain` still passes.
- Idempotent replay returns the stored body. A second credential with the same client key does not replay the first credential’s row.
- Two concurrent sends at the daily cap produce one success and one `send_daily_cap`.
- Revoked key is 401.
- `outbound_emails.payload` for a send contains no `?t=`.
- An API key presented to `GET /envelopes` is 401.

MCP Inspector or the same JSON-RPC from Jest, `apps/api/test/mcp.e2e-spec.ts`:

1. Flag on, one seeded user and API key.
2. `initialize`, `tools/list`, `envelopes_search`, `envelopes_status`, `envelopes_list_pending`.
3. Create, staging upload, add signer, suggest, place, preview. `envelopes_send` returns `approval_pending` for the default key.
4. Tool responses contain no `?t=` substring.
5. `envelopes_sign` is “tool not found”.

Web, Vitest, `renderWithProviders`, queries by role:

- Developers page: one tap on “New key” creates `Key 1` with a 90-day expiry and no Never choice. The show-once sheet has Copy and no checkbox. ChatGPT tile is “Later”.
- `/m/settings` index renders one list. The mobile drawer test expects a single “Settings” row.
- The `approval_request` template is the 560px shell, with a large Approve, a small Deny, and “Expires in 24h”. It has no recipient emails and no signer `?t=`.
- `GET /approvals/from-email/:token` does not set `approved_at` or `denied_at`. A POST without the CSRF cookie returns `csrf_invalid`. The page response includes `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `noindex`, and `X-Frame-Options: DENY`.
- A repeat visit after Approve shows done. A repeat visit after Deny shows denied. An edited envelope shows expired.
- The public card shows at most three recipient names and “+N”, and no email addresses.
- Deny sends `approval_denied` with a signed-in Revoke link. The public page does not revoke.
- In-app queue uses Deny. The bell count matches pending rows.

`migrations-convention.spec.ts` already fails a top-level `*_down.sql` and a missing down pair.

## Pull requests

One feature per pull request. The product review’s 14 steps are the base. Rows marked **Insert** are required by the other reviews and are their own pull requests. Every feature PR uses minimal copy, one or two taps, and an “Advanced” link for the rest. The flag stays off until a later change turns it on. Each tool PR updates the parity test.

| Step | Feature |
| --- | --- |
| Before 3 | Shared UI: `SecretOnceSheet`, `RunList`, `Checkbox`, and promoting `MWBottomSheet` and `ReminderToggle` into `components/`. |
| 1 | Durable match inside `appendEvent`’s transaction. This is not a post-commit hook. The hash chain is unchanged. The function only inserts rows, so it does not call the network. If the automations tables are not in this PR, the call site no-ops until the automations migration registers the matcher. A handler that ran after commit and only logged errors would drop a `sealed` job on a crash, so that shape is out. |
| 2 | API keys: migration (next free id, not `0020`), hashed secret, cap of 10, revoked key is 401, session auth only. `require_owner_approval` defaults to true. `POST {}` names the key `Key N` and sets a 90-day expiry. Null expiry and anything past 365 days are rejected. |
| 3 | Developers page on `/settings/developers` and `/m/settings/developers`, the `/settings` and `/m/settings` index, and one mobile drawer Settings row. One-tap create. Show-once sheet is Copy only. “Connect a client” snippets with placeholders. ChatGPT and Claude tiles say “Later”. Only `envelopes:read` is pre-checked. Hidden when the flag is off. No new `NAV_ITEMS`. |
| 4 | Transport plus `me_get`. `initialize` and `tools/list`. 404 when the flag is off, 401 for a bad key. Structured error envelope. `seald://guide`. Credential boundary. `MCP_DISABLED`. Parity test for the routes that exist. |
| 5 | `envelopes_search` and `envelopes_get`. Title, short code, signer name or email, status, dates. Cursor. No tokens in the output. |
| 6 | `envelopes_status`, `envelopes_download_url`, and `envelopes_list_pending`. Per-signer state, `next_action`, `can_remind_at`. Short-lived download URLs. |
| 7 | Owner approvals. `approval_request` email in the 560px shell (large Approve, small Deny, “Expires in 24h”), deduped. Public `/approve/:token` outside `AppShell`: logo, one card, no login, no document contents, no recipient emails. States pending, done, denied, expired. `link_token_hash`, `approved_at`, `denied_at`. GET never acts. Approve and Deny are CSRF POSTs. `no-store`, `no-referrer`, `noindex`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, rate limit. The server runs the action. The tool returns `approval_pending` (“pending owner approval”) and the agent polls. Deny emails a signed-in Revoke. In-app queue stays secondary. |
| 8 | Draft, upload, and signers. `idempotency_key` and `dry_run`. Staging upload up to 25 MB. `signer_email_taken` on a duplicate. |
| 9 | Suggest and place fields. Suggestions never write. Placing fields checks that the signers belong to the draft. Drafts only. |
| Insert A | Remove the plaintext `?t=` token from `outbound_emails.payload`. Store `token_hash`. Rebuild the link at dispatch. This merges before step 10. |
| Insert B | Audit-certificate attribution line when `metadata.mcp` is present (“Prepared with {client_name} via Seald MCP”). This merges before step 10. |
| 10 | Send via approval. Returns `approval_pending`. Sends only after the owner approves. An edit after the request invalidates it. First-time recipients still require approval. Caps are 20 sends and 25 new recipients. Prompt `first-send`. Depends on Insert A, Insert B, and step 7. |
| 11 | Remind and cancel via approval. The hourly throttle stays. Withdrawal mail goes out. Prompt `chase-overdue`. |
| 12 | Contacts, `contacts_import`, and `contacts_search`. Upsert by email. Per-row errors. Cap of 100 rows per call. Cursor. |
| 13 | `envelopes_create_from_template` and `templates_get_schema`. `initial` maps to `initials`. A use counts only on success. Prefill values are validated. |
| 14 | Drive import and `gdrive_search_files`. `drive.file` only. Conversion can be polled. |

Later, one feature each:

- `envelopes_fix_signer` and `envelopes_change_expiry`, both through approval.
- `envelopes_bulk_send_from_template` and `batches_get`. One approval for the batch. Rows count against the 20 and 25 caps. Prompt `bulk-send`.
- Automations tables, with the matcher from step 1 registered and the worker off.
- Webhook action. Secrets use app-level encryption with a key in the environment, not a billed key service. The screen says “secret set”.
- Automation tools behind the same owner approval, including `automations_test_webhook`, `automations_get_run`, and `automations_retry_run`.
- Drive-save recipe. The default folder is “My Drive / Seald”.
- OAuth 2.1 with ChatGPT and Claude pre-registered, or client metadata documents. No open registration and no paste-a-redirect step. Connected apps appear on the Developers page only after this.
- Agent activity list from `envelope_events.metadata.mcp` (writes only), using `RunList`.

Turning `mcpServer` on is its own change after step 6 has been used with a real key on a staging host.

## Open questions

1. Which MCP protocol revision to pin, at implementation time, against the Inspector version in CI.
2. Whether a local helper is published, and under which name. The package name must not be `seald` or start with `seald-`. The remote endpoint does not depend on publication.
3. CIMD versus a static allow-list for ChatGPT and Claude. Both avoid user-typed redirect URIs. Pick one in the OAuth pull request.
4. Per-key rate numbers are starting points. Adjust from logs.
5. Whether `envelopes_preview_send` should surface `ESIGN_EXCLUDED_CATEGORIES` as a non-blocking warning. The SPA does not block send on that list today. Matching that is the default.

## Risks

| Risk | What we do |
| --- | --- |
| Agent sends mail the owner did not want | In-app approval by default. First-time recipient falls back to approval. Daily caps. Token bound to subject hash and consumed under row lock. |
| Signing token in the mail outbox | Insert A removes `?t=` from `payload` before send tools exist. |
| Agent signs for a person | No signing tool. `agent_is_signer` when the key’s owner is a signer on that envelope. |
| Document text steers the model | Untrusted-data wrapping. No tool can skip the approval queue. |
| Key leaked | Hashed secret, show-once sheet, 90-day default, revoke, 10-key cap, credential boundary. |
| OAuth client impersonation | Pre-registered hosts or CIMD. No open registrar. |
| Metadata shape drift | Only `metadata.mcp` with the fields listed above. Existing `verifyEventChain` tests. |
| Free-tier database | New indexes are the ones in the search section, partial, and sized for the current list query. |
| Two product tracks editing `appendEvent` | Durable automation matches are specified in the automations doc and land in that track’s PR, not inside an MCP tool PR. |

## Legal text

Drafts for counsel. They are not shipped copy until the compliance PR bumps the version constants.

**Terms (electronic agents).** You may connect an application that prepares documents and asks Seald to send them. You are responsible for what that application sends. A person signs only from their own link, after the consent steps Seald shows them. Connecting an application does not let it sign for anyone.

**Privacy (download URLs and connected apps).** If you connect an application, that application can receive document names, signer status, and links you already allow in the product. Seald does not send your files to the application’s model vendor. The application’s host processes what the application asks it to process, under that host’s terms.

**Acceptable use.** Do not use an application connection to send mail to people who did not ask for it, to hide who is sending, or to sign in someone else’s place.

**Sub-processors.** No new sub-processor for the remote MCP endpoint. It runs on the existing API host. A customer’s own model vendor is the customer’s processor, not Seald’s.
