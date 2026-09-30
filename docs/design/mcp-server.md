# MCP server for Seald — technical design

**Status:** proposal. This document does not change the product.
**Date:** 2026-09-30
**Audience:** API and web implementers.
**Companion:** [workflow automations](./workflow-automations.md)

An MCP server lets an AI agent or other bot prepare a document, place fields, send it, and track it, using the same services the SPA uses today. The signer still signs in the browser. The agent never signs for them.

## Summary

Host a remote MCP endpoint on the existing Nest API (`POST /mcp` on the EC2 host behind Caddy). Authenticate with a per-user API key first, and with OAuth 2.1 in a later phase that reuses the Supabase login the sender already has. Tools call `EnvelopesService`, `ContactsService`, `TemplatesService`, and the Google Drive module. Send, remind, cancel, and save-to-Drive require a confirmation token the server minted after showing a summary. Signing stays on `POST /sign/submit`.

The feature is dark until `mcpServer` is `true` in `packages/shared/src/feature-flags.ts`. While it is false, `/mcp` returns 404, the same way `gdriveIntegration` hides `/integrations/gdrive/*`.

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
| Email | `outbound_emails`, `EmailDispatcherService`, `EmailWorkerService` | Invite and reminder rows. There is no `ReminderWorkerService`. `EnvelopesService.remindSigner` inserts a `reminder` row; `EmailWorkerService` (when `WORKER_ENABLED`) and `POST /internal/cron/flush-emails` drain it. |
| Jobs | `envelope_jobs`, `apps/api/src/sealing/worker.service.ts` | `for update skip locked` claim. One row per envelope, kinds `seal` and `audit_only` only. MCP must not enqueue work on this table. |
| Audit chain | `envelope_events.prev_event_hash`, `apps/api/src/envelopes/event-hash.ts` | Canonical JSON includes `metadata`. New attribution belongs in `metadata`, not in a new `actor_kind`. The enum is `sender`, `signer`, `system` (`0002_envelopes.sql`). |
| Idempotency table | `idempotency_records` (`0003_outbound_emails.sql`) | Schema exists. The only production writer today is account deletion, which deletes rows (`MeService`, `IdempotencyRepository.deleteByUser`). MCP is the first feature that stores responses here. |
| Drive | `GDriveController`, `GdriveExportService`, `gdrive_accounts`, `gdrive_envelope_exports` | OAuth PKCE, file list, conversion, folder upload of sealed + audit PDFs. |
| Rate limit | `ThrottlerModule` in `app.module.ts` | 5/s, 60/min, 1000/hr, skipped when `NODE_ENV=test`. Drive adds a per-user bucket (`GDriveRateLimiter`, default 30 per 60s). Remind is 1 invite-or-reminder per signer per hour. |
| Flags | `packages/shared/src/feature-flags.ts` | Compile-time booleans. No admin UI. Tests may set `globalThis.__SEALD_FEATURE_OVERRIDES__`. |
| HTTP limits | `apps/api/src/main.ts` | JSON body 1 MB. `requestTimeout` 30s. CORS `allowedHeaders` is `Content-Type` and `Authorization`. |
| Edge | `deploy/Caddyfile` | `/internal/*` is 404 at the public edge. `/mcp` is a normal public route and is proxied to the API container. |
| Web | Cloudflare Pages, `apps/landing/_worker.js` | SPA prefixes already include `/settings/` and `/m/`. `AppShell` sends viewports at or under 640px to `/m/send`, so a settings page inside `AppShell` never appears on a phone. |
| Migrations | last file `0019_email_signed_to_sender.sql` | Next id is `0020`. From `0013` up, every up-file needs `db/migrations/down/<id>_<name>_down.sql`. |

Envelope statuses the tools return: `draft`, `awaiting_others`, `sealing`, `completed`, `declined`, `expired`, `canceled`. Field kinds: `signature`, `initials`, `date`, `text`, `checkbox`, `email`. Coordinates are normalized 0–1, top-left origin, page ≥ 1 (`envelope_fields`, `PlaceFieldsDto`). Default expiry is 30 days (`DEFAULT_EXPIRY_DAYS` in `envelopes.service.ts`). PDF cap is 25 MB (`MAX_PDF_BYTES`). `delivery_mode` defaults to `parallel` and the signing service does not branch on it, so MCP does not expose a sequential mode.

`POST /templates/:id/use` does not copy `field_layout` onto an envelope. The SPA applies the layout in the browser. An MCP “use template” tool has to do that mapping on the server.

## Shared foundations

Both this server and [workflow automations](./workflow-automations.md) sit on one in-process domain-event publisher.

`EnvelopesRepositoryPg.appendEvent` is the single production insert for `envelope_events` (sender actions, `SigningService`, `SealingService`, and `CronController.expire`). After the row is committed, the repository calls `DomainEventPublisher.publish(event)`. The port lives in `apps/api/src/events/`. The default implementation notifies in-process listeners and does not write a second table. The hash chain is unchanged: publish runs after `prev_event_hash` is stored.

Listeners:

- Automations subscribe and enqueue `automation_jobs` when `workflowAutomations` is on.
- MCP does not need a listener to perform its own tool calls. It calls the existing services, and those services already `appendEvent`.

The first pull request of either track adds the publisher and a no-op listener list. If automations land first, that is phase A1. If MCP lands first, M1 adds the publisher so A1 only registers a subscriber.

When both flags are on, MCP manages automations through the same `AutomationsService` the settings UI uses. Those tools are phase M7, after automations phase A2:

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

The controller is `@Public()` because the global `AuthGuard` only accepts a Supabase JWT. MCP auth runs inside the controller (API key or, later, an MCP access token). An unauthenticated POST returns 401. When `mcpServer` is false, every method throws `NotFoundException('not_found')` before auth, matching `GDriveController.requireFlag`.

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

Workspace package `apps/mcp-stdio`, binary `seald-mcp`. It is not required for the remote server to be useful.

- Reads `SEALD_API_BASE_URL` (default `https://api.seald.nromomentum.com`) and `SEALD_API_KEY` from the environment.
- Speaks MCP on stdin/stdout.
- Forwards each JSON-RPC message to `POST /mcp` with `Authorization: Bearer <key>`.
- Does not store the key on disk. Does not log the bearer header.
- Publishing the package to a public registry is a separate decision (see open questions). M1 can ship the folder without a release.

## Auth

Two mechanisms, same scopes, same owner id. Keys ship in M1. OAuth ships in M6. A request presents one credential. Scopes are the intersection of what the credential has and what the tool requires. Missing scope is a tool error `insufficient_scope`, HTTP 200 with `isError: true` (the JSON-RPC call itself succeeded). HTTP 401 is only for a missing, revoked, expired, or unknown credential.

### Scopes

| Scope | Allows |
| --- | --- |
| `envelopes:read` | List, get, events, download URL, suggest fields (read-only). |
| `envelopes:write` | Create, patch, delete draft, upload, signers, place fields. |
| `envelopes:send` | Preview, send, remind, cancel. All of these still need a confirmation token. |
| `contacts:read` / `contacts:write` | Contact CRUD. |
| `templates:read` / `templates:write` | Template CRUD, use, example PDF. |
| `gdrive:read` | List accounts and files, connect URL. |
| `gdrive:write` | Disconnect, start conversion, save sealed files to a folder. Save still needs confirmation. |
| `automations:read` / `automations:write` | M7. |

There is no scope that can sign, and no scope that can create API keys. Key management is the SPA session only (`RequireAuth`, Supabase JWT), so a leaked agent key cannot mint another key.

### API keys

Migration `0020_mcp_api_keys.sql` (renumber if `0020` is taken before the PR merges). Paired down script in `db/migrations/down/`.

```sql
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  prefix       text not null,
  key_hash     text not null check (char_length(key_hash) = 64),
  scopes       text[] not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);
```

RLS on, no policies, same posture as `contacts` and `envelopes`: the API connects with a role that bypasses RLS; anon and authenticated PostgREST roles see nothing. Index `(prefix)` where `revoked_at` is null, and `(owner_id)`.

Generation:

1. 32 random bytes, base64url.
2. Display form `seald_live_<secret>`, shown once in the settings UI.
3. `prefix` is `seald_live_` plus the first 8 characters of the secret, so the list can show `seald_live_a1b2c3d4…`.
4. `key_hash` is hex SHA-256 of the full `seald_live_…` string. The plaintext is not stored, not logged, and not recoverable. A lost key is revoked and replaced.

Verification: parse the bearer value, reject anything that does not start with `seald_live_`, look up the active row by `prefix`, compare hashes with `timingSafeEqual` (the same constant-time approach `CronController` uses for `X-Cron-Secret`). Then check `revoked_at`, `expires_at`, and scopes. Update `last_used_at` at most once a minute so a chatty agent does not write the row on every tool call.

Revocation sets `revoked_at`. The next request with that key returns 401 `api_key_revoked`. There is no grace period. Account deletion already removes rows that reference `auth.users` via `on delete cascade`. `MeService` should also delete any MCP confirmation rows for that user (below).

Limits, enforced in the create path: 10 live keys per owner. Optional `expires_at` supplied by the user, maximum 1 year. Name is unique per owner among live keys.

### OAuth 2.1 (phase M6)

The MCP authorization spec expects a protected resource, an authorization server, OAuth 2.1, PKCE with S256, and a resource indicator. Supabase Auth remains the place the human proves who they are. It is not, by itself, an MCP authorization server: it does not publish protected-resource metadata for this API, and MCP clients will not be registered in the Supabase dashboard one by one.

Seald’s API is both the resource server and a thin authorization server. Supabase is the identity provider behind the consent screen.

1. Client `POST /mcp` with no bearer token.
2. `401` and `WWW-Authenticate: Bearer realm="seald", resource_metadata="https://api.seald.nromomentum.com/.well-known/oauth-protected-resource"`.
3. Protected-resource metadata points at the authorization server on the same host and lists the scopes above. The resource identifier is `https://api.seald.nromomentum.com/mcp`.
4. Authorization-server metadata (`/.well-known/oauth-authorization-server`) advertises authorization-code, PKCE S256, and refresh-token rotation. Dynamic client registration is off (see open questions).
5. The user is sent to the SPA route `/oauth/mcp/consent` (new, outside `AppShell`, same reason `/oauth/gdrive/callback` is). The page requires a Supabase session. It shows the client name and scopes. Approve calls the API with the Supabase JWT.
6. The API issues an authorization code bound to `user_id`, `client_id`, S256 challenge, redirect URI, resource, and scopes. Codes live in Postgres, single use, 60 seconds. This follows the existing PKCE shape in `oauth-pkce.ts` (verifier, S256 challenge, single-use `state`), stored in Postgres rather than the in-memory `OAuthStateStore`, so a process restart does not drop the code.
7. The token endpoint checks the verifier, the resource indicator (must equal the MCP resource URL), and the redirect URI. It returns an opaque access token (about 1 hour) and a refresh token.
8. Only hashes of access and refresh tokens are stored. Revoking a grant in settings deletes them. Refresh rotates the refresh token and invalidates the previous one.

Tables in the M6 migration (next free id at that time): `oauth_clients` (id, owner_id, name, redirect_uris, revoked_at), `oauth_grants` (client_id, owner_id, scopes, refresh_token_hash, revoked_at), `oauth_access_tokens` (hash, grant_id, expires_at). RLS on, no policies.

Public clients only (PKCE, no client secret). The user registers a redirect URI in the settings UI. A client that cannot open a browser uses an API key instead.

## Tool catalog

Conventions for every tool:

- Input is a JSON Schema object. Unknown fields are rejected.
- Output is the JSON object below, or `{ "isError": true, "slug": "<ErrorSlug or mcp slug>", "message": "<slug>" }`.
- The slug matches `HttpExceptionFilter`, which returns `{ "error": "<slug>" }`. MCP maps that slug through; it does not invent a second vocabulary for errors the services already throw.
- `owner_id` always comes from the credential, never from the arguments.
- Mutating tools accept optional `idempotency_key` (string, 8–200 chars). See below.
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

Input: `{ "status"?: string[], "limit"?: number, "cursor"?: string, "q"?: string, "tags"?: string }`. Same filters as `GET /envelopes`. `limit` max 50.

Output: `{ "items": ["Envelope summary without fields"], "next_cursor": "string|null" }`.

**`envelopes_get`** → `EnvelopesService.getById`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid" }`. Output: `Envelope`.

**`envelopes_list_events`** → `EnvelopesService.listEvents`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid" }`. Output: `{ "events": [{ "id", "event_type", "actor_kind", "signer_id", "created_at", "metadata" }] }`. Metadata may include the MCP attribution object defined below. It does not include tokens.

**`envelopes_download_url`** → `EnvelopesService.getDownloadUrl`. `readOnlyHint: true`.

Input: `{ "envelope_id": "uuid", "kind"?: "sealed"|"original"|"audit" }`. Output: `{ "url": "string", "kind": "sealed"|"original"|"audit" }`. The URL is the same short-lived storage URL the SPA already receives. The tool description tells the client to treat it as a secret and not to place it in a webhook, a prompt log, or a shared chat if that can be avoided. This is the owner’s download, not a signer token.

**`me_get`** → the authenticated user id and email already on `AuthUser` (the same facts as `GET /me`). `readOnlyHint: true`. No scope beyond a valid credential. Output: `{ "id", "email" }`.

### Prepare an envelope (M2) — scope `envelopes:write`

**`envelopes_create`** → `EnvelopesService.createDraft`.

Input: `{ "title": "string (1–200)", "idempotency_key"?: "string" }`. Output: `Envelope`. Writes event `created` with `actor_kind: sender`.

**`envelopes_update`** → `EnvelopesService.patchDraft`.

Input: `{ "envelope_id", "title"?, "expires_at"?, "tags"?, "idempotency_key"? }`. Tags follow `PatchEnvelopeDto` (max 10, 32 chars). Drafts only (`envelope_not_draft`).

**`envelopes_delete_draft`** → `EnvelopesService.deleteDraft`. `destructiveHint: true`.

Input: `{ "envelope_id", "idempotency_key"? }`. Output: `{ "deleted": true }`. Sent envelopes use cancel, not delete.

**`envelopes_upload_pdf`** → `EnvelopesService.uploadOriginal`.

The JSON parser stops at 1 MB (`main.ts`), and a 25 MB PDF does not fit in a tool argument. The tool does not take base64.

Flow:

1. Client `POST /mcp/uploads` as `multipart/form-data` field `file`, same credential as `/mcp`, multer limit 30 MB, service limit 25 MB (same numbers as `POST /envelopes/:id/upload`).
2. The handler stores the bytes with `StorageService` under a short-lived key `mcp-uploads/<user_id>/<upload_id>` and returns `{ "upload_id", "sha256", "byte_length" }`. Rows expire after 15 minutes; the worker or the next cron tick deletes the object.
3. Tool input: `{ "envelope_id", "upload_id" }`. The handler loads the object, calls `uploadOriginal`, then deletes the staging object.

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

**`envelopes_preview_send`** → the checks at the start of `EnvelopesService.send`, without `sendDraft`. Scope `envelopes:send`. `readOnlyHint: true`.

Checks: file present, at least one signer, at least one field, every signer has a required `signature` or `initials` field. On success the server stores a confirmation row and returns a token.

Input: `{ "envelope_id" }`.

Output:

```json
{
  "ready": true,
  "summary": {
    "title": "string",
    "signers": [{ "name": "string", "email": "string" }],
    "field_count": 0,
    "expires_at": "date-time"
  },
  "confirmation_token": "string",
  "expires_in_seconds": 600
}
```

The token is 32 random bytes, base64url. The table stores only its SHA-256. Columns: `id`, `owner_id`, `api_key_id` nullable, `tool` (`send` | `remind` | `cancel` | `gdrive_save`), `envelope_id`, `subject_hash`, `token_hash`, `expires_at`, `consumed_at`. `subject_hash` is SHA-256 of canonical JSON of the envelope id, `updated_at`, signer ids, and field ids. A later edit makes the token useless. TTL 10 minutes, single use.

The tool description states that the host must show `summary` to the human and call the mutating tool only after the human agrees. A model saying “the user agreed” is not enough: the token is the agreement.

**`envelopes_send`** → `EnvelopesService.send`. Scope `envelopes:send`. `openWorldHint: true` (it emails people).

Input: `{ "envelope_id", "confirmation_token", "idempotency_key"? }`. No `confirm: true` boolean. The token is the confirmation.

The service already refuses a second send with `envelope_not_draft` and is safe to retry after the status flip. Plaintext signer tokens exist only inside `send`, long enough to build the invite payload (`sign_url`). The tool result is the `Envelope` after send, with status `awaiting_others`. It does not include `sign_url`.

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

The agent cannot open the Google Picker. The human picks the folder in the SPA (settings or the envelope download menu). The agent passes the folder id the user copied, or an id stored on an automation recipe. M5 does not add a server-side folder browser beyond `gdrive_list_files`.

## Resources and prompts

Resources are read-only views over the same services. URIs:

| URI | Body |
| --- | --- |
| `seald://envelopes` | JSON list, first page, no cursor loop inside the resource. |
| `seald://envelopes/{id}` | `envelopes_get` payload. |
| `seald://envelopes/{id}/events` | Event list. |
| `seald://contacts` | Contact list. |
| `seald://templates` | Template list, including `field_layout` and `last_signers`. |
| `seald://account` | `me_get`. |

Unknown ids return a resource error with slug `envelope_not_found` or `contact_not_found`, not an empty document.

Prompts (no side effects; they return messages that tell the model which tools to call):

**`prepare-and-send`** — “Prepare and send for signature.”

Arguments: `title`, `signer_emails` (array of `{name, email}`), optional `template_id`, optional `source` (`upload` or `drive_file_id`).

Message body, in short:

1. Create the envelope. Attach the PDF via upload or Drive import.
2. Add signers. Create contacts only if the user asked to save them.
3. If `template_id` is set, `templates_use`. Otherwise `envelopes_suggest_fields`, show the suggestion, then `envelopes_place_fields` after the user accepts the placement.
4. `envelopes_preview_send`. Show the summary. Stop until the human confirms.
5. `envelopes_send` with the token.
6. Report status, signer names, and the verify path `/verify/{short_code}`. Do not include a signing link.

**`status-check`** — argument `envelope_id` or `query`. Tells the model to list or get, then summarize who has viewed or signed. Read-only.

**`remind-pending`** — argument `envelope_id`. Tells the model to remind only signers with `signed_at` null, one preview per signer, and to stop when `remind_throttled` is returned.

## Human confirmation, and the signer’s own act

Send, remind, cancel, disconnect Drive, and save-to-Drive are two calls: a preview that returns a one-time token, then the action with that token. The token is bound to the subject hash. The settings UI and the tool description both say the person operating the agent must see the summary.

The agent prepares and sends. The signer signs.

The signer’s path is unchanged:

1. Email link `/sign/:envelopeId?t=<token>` (the token is only inside `outbound_emails.payload`, written by `EnvelopesService.send`).
2. `POST /sign/start` exchanges it for cookie `seald_sign`.
3. `POST /sign/accept-terms`, `POST /sign/esign-disclosure`, `POST /sign/intent-to-sign`.
4. The signer fills fields and `POST /sign/submit`, or `POST /sign/decline`.

That sequence is what records intent and the ESIGN consumer disclosure (`ESIGN_DISCLOSURE_VERSION` in `packages/shared/src/compliance.ts`, currently `esign_v0.3`). An agent completing those steps would put the agent’s action where the signer’s intent belongs. MCP has no tool, resource, or prompt that calls `SigningService`. Code review for every MCP PR includes a check that `src/mcp` does not import `signing.service.ts` or `signer-session.service.ts`.

Legal effect stays the effect of the existing flow. `SIGNATURE_LEVEL_NOTE` is the wording implementers should keep in the settings page: simple electronic signature, ESIGN and UETA consent, hash-chained audit trail, PAdES seal when a seal is applied. Documents in `ESIGN_EXCLUDED_CATEGORIES` remain a sender warning, not something MCP special-cases. The audit certificate (`audit-pdf.tsx`) does not currently print free-form event metadata. MCP attribution is still in `envelope_events`, which `GET /verify/:short_code` covers via `chain_intact`. Putting the client name on the certificate PDF is a later change to `audit-pdf.tsx`, not part of M1, so the certificate layout does not move in the same PR as the server.

Attribution written by MCP-originated service calls:

- `actor_kind` stays `sender` for actions the account owner authorized (create, cancel, reminder) and `system` where the service already uses `system` (the per-signer `sent` event inside `send`). Do not add an enum value. A new `actor_kind` is a migration and a change to every reader of `ActorKindDb`.
- `metadata.mcp` = `{ "key_id": "uuid|null", "client_name": "string", "tool": "string" }`. `event-hash.ts` already canonicalizes `metadata` with sorted keys, so these fields are covered by `prev_event_hash`.
- `user_agent` on those events is `SealdMCP/1 <client_name>` (truncated to a safe length). `ip` is `extractClientIp` of the MCP request.

`EnvelopesService.createDraft`, `send`, `cancel`, and `remindSigner` gain an optional metadata bag passed through to `appendEvent`. Existing HTTP controllers pass nothing, so current events stay `metadata: {}`.

## Rate limits, idempotency, errors

Global `ThrottlerGuard` still applies. Override it on `McpController` and the upload route so one agent is not cut off at 5 requests per second while a shared NAT is also browsing the SPA:

| Bucket | MCP route |
| --- | --- |
| short | 10 / 1s |
| medium | 60 / 1 min |
| long | 500 / 1 hr |

Add a per-credential bucket, same shape as `GDriveRateLimiter`, key `mcp:<key_id or grant_id>`, capacity 30 per 60 seconds. Drive tools also call `GDriveRateLimiter.acquire(userId)` before any Google request. Remind keeps the one-hour rule in `remindSigner`.

HTTP 429 body slug `rate_limited`, plus `retry_after_seconds`. The tool layer surfaces that slug with `isError: true`.

Idempotency reuses `idempotency_records`:

- Primary key `(user_id, idempotency_key)` already.
- On a mutating tool with a key: if a row exists and `request_hash` matches, return the stored `response_body` and status class. If the hash differs, tool error `idempotency_conflict`.
- `request_hash` is SHA-256 of the tool name plus canonical JSON of the arguments minus the idempotency key itself.
- TTL stays the column default of 24 hours.
- Extend `IdempotencyRepository` with get and insert. Keep `deleteByUser` on the account-deletion path. The table has no foreign key in `0003_outbound_emails.sql`; deletion is explicit.

Confirmation tokens and idempotency keys solve different problems. The token proves a human saw a summary. The key makes a retried `envelopes_create` return the same envelope instead of two drafts.

Error table (tool `isError` unless noted):

| Situation | Slug | HTTP |
| --- | --- | --- |
| Flag off | `not_found` | 404 |
| Missing or bad credential | `missing_token` / `invalid_token` / `api_key_revoked` / `api_key_expired` | 401 |
| Scope missing | `insufficient_scope` | 200 tool error |
| Confirmation missing, used, expired, or subject changed | `confirmation_required` / `confirmation_invalid` | 200 tool error |
| Service `HttpException` | existing slug (`envelope_not_draft`, `file_too_large`, `remind_throttled`, …) | 200 tool error |
| Upload route, no file | `file_required` | 400 |
| JSON-RPC parse or unknown method | JSON-RPC `-32700` / `-32601` | 200 or 400 as the transport requires |
| Unexpected throw | `internal_error` | 500, logged by `HttpExceptionFilter` without the bearer token |

Do not put argument values that might contain a token into logs. Log tool name, owner id, key id, slug, and duration.

## Settings UI

Mobile first. `AppShell` redirects ≤640px to `/m/send` (`apps/web/src/layout/AppShell.tsx`), so the phone UI lives outside the shell, next to `MobileIntegrationsPage` at `/m/send/settings`.

| Route | Who | Shell |
| --- | --- | --- |
| `/settings` | Signed-in desktop | Replace the hard redirect to integrations with a short index: Integrations, Developers, Automations. Integrations stays the Drive page. |
| `/settings/developers` | Desktop | `AppShell`, `RequireAuth`. |
| `/m/settings/developers` | Phone | No `AppShell`. Linked from the mobile sender overflow, beside the existing Drive settings link. |

`/settings/` and `/m/` are already in `SPA_PREFIXES` (`apps/landing/_worker.js`). New paths still need to match a real `AppRoutes.tsx` route so `spa-worker-routes.contract.test.ts` stays valid.

The page, one column, full-width controls, targets at least 44px:

1. Title “Developers”, one sentence: keys let an app prepare and send on your behalf. Signers still sign from their own link.
2. `SIGNATURE_LEVEL_NOTE` as helper text, so the screen does not overclaim what a signature is.
3. List of keys: name, prefix, scopes as short labels, created date, last used, expiry. Primary action “New key”. Destructive action “Revoke” opens a confirm sheet (name the key, then revoke).
4. New-key sheet: name, scope groups as checkboxes (read is pre-checked; send is off until tapped), optional expiry. Create calls `POST /me/api-keys` with the Supabase session, not with an API key.
5. Secret sheet: the full `seald_live_…` value, a copy button, and “I have saved this key”. Closing the sheet drops the value from client state. The list then shows only the prefix.
6. After M6, a second list “Connected apps”: client name, scopes, last used, revoke. Empty until a grant exists.

Flag off: the nav entry is hidden, same pattern as `handleOpenIntegrations` checking `gdriveIntegration`. Direct visits get the same not-available state the Drive page uses when a dependency is missing, not a broken form.

API (session JWT, not MCP):

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/me/api-keys` | List without hashes. |
| `POST` | `/me/api-keys` | `{ name, scopes, expires_at? }` → row plus `secret` once. |
| `POST` | `/me/api-keys/:id/revoke` | `{ revoked: true }`. |

These routes 404 when the flag is off.

## Test plan

Contract tests, Jest, `apps/api/src/mcp/__tests__/tool-catalog.contract.spec.ts`:

- Every tool in the catalog has a name, a JSON Schema that accepts a valid fixture, and a schema that rejects a missing required field.
- The catalog’s scope set is exactly the scope union documented above.
- No tool name contains `sign`, `decline`, `submit`, or `disclosure`.
- A static import check fails if `src/mcp` imports the signing module.

Service tests with the in-memory envelope repository:

- Preview then send calls `EnvelopesService.send` once and returns no `sign_url` and no `access_token`.
- Send without a token does not call `send`.
- A second use of the token fails.
- Patching the draft after preview changes `subject_hash` and the token fails.
- `metadata.mcp` is present on the `created` event and the chain still verifies (`verifyEventChain`).
- Idempotent replay returns the stored body and does not create a second envelope.
- Revoked key is 401.

MCP Inspector end-to-end, `apps/api/test/mcp.e2e-spec.ts` plus a documented inspector run:

1. Boot the API the way existing e2e boots it, flag override on, one seeded user and API key.
2. Script the Inspector CLI (`npx @modelcontextprotocol/inspector --cli`) against `http://127.0.0.1:<port>/mcp` with the bearer key, or, if the CLI cannot run headless in CI, speak the same JSON-RPC messages from Jest and keep the Inspector command in the test file header for a human run.
3. Sequence: `initialize`, `tools/list`, `envelopes_create`, staging upload, `envelopes_upload_pdf`, `envelopes_add_signer`, `envelopes_suggest_fields`, `envelopes_place_fields`, `envelopes_preview_send`, `envelopes_send`, `envelopes_get` expects `awaiting_others`.
4. Assert the invite row exists in `outbound_emails` and the tool responses contain no `?t=` substring.
5. Call a made-up `envelopes_sign` and expect “tool not found”.

Web: Vitest for the developers page (empty, secret shown once, revoke confirm) using `renderWithProviders`, queries by role. Cover the mobile route and the desktop route. Playwright is not required for M1 if the Vitest cases hit the same components.

`apps/api/test/migrations-convention.spec.ts` already fails a top-level `*_down.sql` and a missing pair. The new migration must satisfy it.

## Phased rollout

Each phase is one pull request, flag `mcpServer` default `false`, and is safe to deploy before the flag is turned on. Later phases add tools; they do not rewrite the transport.

| Phase | Ships | Flag-off behavior |
| --- | --- | --- |
| M1 | `DomainEventPublisher` if A1 has not landed. Migration `0020_mcp_api_keys.sql`. `POST /mcp` with `initialize`, `tools/list`, read tools, resources, prompts `status-check`. API-key auth. Settings pages and `/me/api-keys`. Contract test and inspector e2e for the read path. | `/mcp` and `/me/api-keys` 404. Nav entry hidden. |
| M2 | Create, update, delete draft, upload staging, add and remove signer. Idempotency writes. | New tools absent from the list. |
| M3 | Suggest, place, preview, send, remind, cancel. Confirmation table (can share the M1 migration if M3 is close behind; otherwise the next id). | Send tools absent. Existing HTTP send is unchanged. |
| M4 | Contacts and templates, including server-side `templates_use` mapping. Prompt `prepare-and-send`. |  |
| M5 | Drive tools. Still `drive.file`. Depends on `gdriveIntegration`. | Drive tools omitted when either flag is off. |
| M6 | OAuth 2.1 metadata, consent page, grants, refresh rotation. Connected-apps section on the developers page. Stdio wrapper accepts either a key or an OAuth token it was given; it does not run the browser flow itself. | Keys keep working. |
| M7 | Automation tools in the shared-foundations table. After automations A2. |  |

Turning the flag on is a one-line change in `feature-flags.ts` plus a deploy, after M1 has been exercised against a real key on a staging host. Do not flip it in the M1 PR.

## Open questions

1. Which MCP protocol revision to pin, at implementation time, against the Inspector version in CI.
2. Whether `apps/mcp-stdio` is published, and under which package name. The remote endpoint does not depend on publication.
3. Dynamic client registration. This design leaves it off and uses user-registered redirect URIs, because an open registrar on a public API will be scripted. Revisit if a major host requires CIMD or DCR and cannot use an API key.
4. Whether `metadata.mcp` should appear on the audit certificate. The chain stores it either way. The certificate change is a separate product decision because it alters a document signers download.
5. Per-key rate numbers (30/min, 500/hr) are starting points. Adjust after the first real agent sessions, using logs, not a new datastore.
6. Should `envelopes_preview_send` also surface `ESIGN_EXCLUDED_CATEGORIES` as a non-blocking warning in the summary? The SPA does not block send on that list today. Matching that behavior is the default.

## Risks

| Risk | What we do |
| --- | --- |
| An agent sends mail the owner did not intend | Confirmation token bound to the signer and field set. Send scope is opt-in on the key. |
| A tool result leaks a signing token | Tokens stay inside `send` and the email payload. Tests grep tool output for `?t=`. Review rule against importing `SigningService`. |
| A leaked key is reused | Prefix lookup, hash compare, instant revoke, no key-minting scope, optional expiry, 10-key cap. |
| Audit chain breaks because metadata shape drifts | Only `metadata.mcp` with sorted-key canonical JSON, covered by existing `verifyEventChain` tests. |
| JSON-RPC upload of a 25 MB PDF blows the 1 MB parser or the 30s timeout | Staging multipart route; conversion poll if Gotenberg is slow. |
| `drive.file` surprises the agent (“list my Drive”) | Tool copy states the scope limit. No new Google scope. |
| MCP and the SPA share the 5 rps throttler and lock each other out | Route-level throttle override plus a per-key bucket. |
| OAuth consent page is phishable | Exact redirect URI match, PKCE, resource indicator, short-lived code, user-registered clients only. |
| Free-plan Postgres fills with idempotency and confirmation rows | 24 hour TTL and a delete of expired rows from the existing worker loop. No new database. |
| Implementers describe the signature as qualified or as the same as wet ink | Settings copy uses `SIGNATURE_LEVEL_NOTE`. This doc’s non-goals repeat that limit. |
