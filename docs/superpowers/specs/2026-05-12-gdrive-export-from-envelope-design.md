# Save envelope artifacts to Google Drive — design

**Date:** 2026-05-12
**Status:** approved (brainstorming) — ready for implementation

## Summary

Add a **"Save to Google Drive"** row to the existing **Download** dropdown on
the envelope detail page. Clicking it pushes the envelope's **sealed PDF +
audit-trail PDF** (the "Full package" contents) into a Google Drive folder the
user picks via the Google Picker. If the user hasn't connected a Drive account
yet, the click opens the OAuth popup and — once authorized — continues straight
into the folder picker + upload.

Works on the existing minimal `drive.file` OAuth scope (we only ever create new
files, into a Picker-picked or app-created folder) — **no scope upgrade, no CASA
audit**.

## Decisions (locked during brainstorming)

- **What to push:** the sealed PDF + the audit-trail PDF. Only available once the
  envelope is sealed; the row is rendered but locked otherwise (like the existing
  "Sealed PDF" / "Audit trail" rows).
- **Destination:** the user picks a folder via the Google Picker (folder-select
  mode). The last-used folder for that envelope/account is remembered and the
  Picker opens *inside* it next time (`setParent`), so re-saving is one click.
- **Not connected yet:** clicking the row opens the Google OAuth popup; after
  authorizing it flows straight into the folder picker and upload — one seamless
  action (mirrors the Drive *import* flow's first-time connect).
- **Re-push:** re-saving into the same folder updates the previously-created
  files in place (`files.update`, allowed under `drive.file` since the app
  created them); re-saving into a different folder creates new files there and
  updates our record. No accumulating duplicates.
- **Feature flag:** gated on the existing `gdriveIntegration` flag — no new flag.
- **Approach:** "Picker on the client, upload on the server" — the SPA picks the
  folder; a new server endpoint does the actual Drive upload. Artifact bytes
  never touch the browser; the Drive access token is used for writes only
  server-side; the server keeps an export record.

## Architecture

```
[DownloadMenu row "Save to Google Drive"]  (apps/web)
   │ not connected? → window.open(GET /integrations/gdrive/oauth/url) → authorize → refetch accounts
   │ GET /integrations/gdrive/picker-credentials → { accessToken, developerKey, appId }
   │ google.picker (ViewId.FOLDERS, setSelectFolderEnabled, setParent(lastFolderId?)) → user picks folder F
   ▼
POST /envelopes/:id/gdrive/save  { folderId: F.id, folderName: F.name }     (apps/api)
   • assert: gdriveIntegration on; envelope owned by user; envelope sealed
   • account = most-recently-used row in gdrive_accounts for this user (404 gdrive_not_connected if none)
   • token  = GDriveService.getAccessToken(account)          // refreshes on demand, dedups
   • rateLimiter.take(user.id, cost = 2)
   • export = gdrive_envelope_exports row for (envelope_id, account_id)  (may be null)
   • for kind in [sealed, audit]:
        bytes = StorageService.download(artifactPath(envelope, kind))
        name  = `${sanitize(envelope.title)} (${kind === 'sealed' ? 'sealed' : 'audit trail'}).pdf`
        if export?.[`${kind}_file_id`] && F.id === export.folder_id:
           file = drive.files.update(export[`${kind}_file_id`], mediaBytes)   // 404 → fall through to create
        else:
           file = drive.files.create({ name, parents:[F.id], mimeType:'application/pdf' }, mediaBytes, { supportsAllDrives:true })
   • upsert gdrive_envelope_exports(envelope_id, account_id, folder_id, folder_name, sealed_file_id, audit_file_id, last_pushed_at = now())
   • bump gdrive_accounts.last_used_at
   • return 200 { folder:{id,name,webViewLink}, files:[{kind,fileId,name,webViewLink}×2], pushedAt }
   ▼
toast "Saved to Google Drive ↗"  (links the folder) → invalidate the envelope query
```

## API contract

### `POST /envelopes/:id/gdrive/save`

Auth: current user, must own the envelope.

Request body:

```jsonc
{ "folderId": "1AbC…", "folderName": "Clients/Acme/Contracts" }
```

Preconditions (each maps to an error code, see below):
- `gdriveIntegration` flag enabled — else `404 not_found` (no info leak; matches
  the rest of `/integrations/gdrive/*`).
- Envelope exists and is owned by the user — else `404 envelope_not_found`.
- Envelope is sealed (sealed + audit artifacts present) — else `409 envelope_not_sealed`.
- User has ≥ 1 connected Drive account — else `409 gdrive_not_connected`.

Success `200`:

```jsonc
{
  "folder": { "id": "1AbC…", "name": "Clients/Acme/Contracts", "webViewLink": "https://drive.google.com/drive/folders/1AbC…" },
  "files": [
    { "kind": "sealed", "fileId": "1Sea…", "name": "UNCONDITIONAL WAIVER - 7.05.2026 (sealed).pdf", "webViewLink": "https://drive.google.com/file/d/1Sea…/view" },
    { "kind": "audit",  "fileId": "1Aud…", "name": "UNCONDITIONAL WAIVER - 7.05.2026 (audit trail).pdf", "webViewLink": "https://drive.google.com/file/d/1Aud…/view" }
  ],
  "pushedAt": "2026-05-12T13:00:00.000Z"
}
```

Partial success `207` (first upload OK, second failed):

```jsonc
{
  "folder": { "id": "1AbC…", "name": "…" },
  "files": [ { "kind": "sealed", "fileId": "1Sea…", "name": "…", "webViewLink": "…" } ],
  "error": { "kind": "audit", "code": "gdrive_upstream_error" },
  "pushedAt": "2026-05-12T13:00:00.000Z"
}
```

(The export record is still upserted with whatever file IDs succeeded; re-push retries the missing one.)

### Envelope-detail payload addition

`GET /envelopes/:id` gains:

```jsonc
"gdriveExport": {
  "connected": true,
  "lastFolder": { "id": "1AbC…", "name": "Clients/Acme/Contracts" } | null,
  "lastPushedAt": "2026-05-12T13:00:00.000Z" | null
} | null   // null when the gdriveIntegration flag is off
```

`connected` is "does the user have any `gdrive_accounts` row" (one query, joined
into the detail read). `lastFolder` / `lastPushedAt` come from the
`gdrive_envelope_exports` row for this envelope, if any. The SPA uses
`connected` to decide whether to open the OAuth popup first, and `lastFolder` to
`setParent()` on the Picker and to render the "Last saved to Drive · {relative}" meta line.

## Data model

New table `gdrive_envelope_exports`:

| column | type | notes |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `envelope_id` | `uuid` | FK → `envelopes(id)` on delete cascade |
| `account_id` | `uuid` | FK → `gdrive_accounts(id)` on delete cascade |
| `folder_id` | `text` | Drive folder id of the last save |
| `folder_name` | `text` | display name captured from the Picker |
| `sealed_file_id` | `text` null | Drive file id of the last-saved sealed PDF |
| `audit_file_id` | `text` null | Drive file id of the last-saved audit PDF |
| `last_pushed_at` | `timestamptz` | |
| `created_at` | `timestamptz` default `now()` | |
| `updated_at` | `timestamptz` default `now()` | |

- Unique constraint on `(envelope_id, account_id)`.
- RLS enabled, owner-only (the row's envelope must be owned by `auth.uid()`), matching project convention.
- Migration: `apps/api/db/migrations/00NN_gdrive_envelope_exports.sql` + paired
  `apps/api/db/migrations/down/00NN_gdrive_envelope_exports_down.sql` (rule M.3).
- pg-mem test DB (`apps/api/test/pg-mem-db.ts`) gets the same `create table` so the repo specs run.

"Remember the last folder per account" = `SELECT folder_id, folder_name FROM
gdrive_envelope_exports WHERE account_id = $1 ORDER BY last_pushed_at DESC LIMIT 1`
— but for the envelope-detail payload we just read this envelope's own row, which
is the most relevant default. No change to `gdrive_accounts`.

## Server components

- `apps/api/src/envelopes/envelopes.controller.ts` — add the `POST :id/gdrive/save` route; thin, delegates to the service.
- `apps/api/src/envelopes/envelopes.service.ts` — `saveToGoogleDrive(userId, envelopeId, { folderId, folderName })`: ownership + sealed checks, then delegates the Drive work to a new `GdriveExportService`.
- `apps/api/src/integrations/gdrive/gdrive-export.service.ts` — **new**. Owns: pick the account, get the token, rate-limit, the per-artifact upload-or-update loop, the export-record upsert. Depends on `GDriveService` (token), `GoogleDriveClient` (HTTP), `StorageService` (bytes), `GdriveEnvelopeExportsRepository` (record).
- `apps/api/src/integrations/gdrive/google-drive.client.ts` — extend the existing minimal fetch-based Google client (or add a sibling) with `filesCreate(token, { name, parents, mimeType }, bytes, opts)` and `filesUpdate(token, fileId, bytes, opts)` — both `uploadType=multipart` against `https://www.googleapis.com/upload/drive/v3/files`, `fields=id,name,webViewLink`, `supportsAllDrives=true`. Map non-2xx to the gdrive error taxonomy (`401/403 → permission/reconnect`, `429 → rate_limited` with `Retry-After`, `5xx → upstream`).
- `apps/api/src/integrations/gdrive/gdrive-envelope-exports.repository.ts` — **new**, Kysely: `findByEnvelopeAndAccount`, `upsert`, `findLatestFolderForAccount`. (Mirror the existing `gdrive_accounts` repo.)
- Reuse: `GDriveService.getAccessToken`, `GDriveRateLimiter`, `GDriveErrorCode`, the env-var contract — all unchanged.

## Web components

- `apps/web/src/components/DownloadMenu/DownloadMenu.tsx` — add an optional `action?: 'download' | 'gdrive'` to `DownloadMenuItem` (default `'download'`). `'gdrive'` items render below a divider with the Drive icon, a `meta` line, the locked state when unavailable, the spinner when `inFlight === item.kind`. `onSelect` still fires the item's `kind` (`'gdrive'`).
- `apps/web/src/pages/EnvelopeDetailPage/EnvelopeDetailPage.tsx` —
  - include the gdrive item in `downloadItems` only when `isFeatureEnabled('gdriveIntegration')`; `available: isComplete`; `meta`: `"Last saved to Drive · {relative}"` when `gdriveExport.lastPushedAt`, else `"Sends the sealed PDF + audit trail"`.
  - `handleSaveToGdrive`: (1) `gdriveExport.connected === false` → open the OAuth popup (`GET /integrations/gdrive/oauth/url` → `window.open`), await success (popup `postMessage` or poll-closed → refetch accounts/detail), bail with a toast if still not connected; (2) `GET /integrations/gdrive/picker-credentials` → `gapi.load('picker')` → build a `google.picker.PickerBuilder` with a `DocsView(ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true)`, `setParent(gdriveExport?.lastFolder?.id)` if present, `setOAuthToken`, `setDeveloperKey`, `setAppId`, `setCallback`; (3) on folder pick → `setInFlight('gdrive')` → `saveEnvelopeToGdrive(id, { folderId, folderName })`; (4) success → toast "Saved to Google Drive ↗" linking `folder.webViewLink` → `queryClient.invalidateQueries` for the envelope; (5) error → mapped toast (see below).
  - Reuse the import flow's existing gapi/picker loader + OAuth popup helper if present (`apps/web/src/features/gdrive/*` / wherever the import lives); else add a small `loadGooglePicker()` + `openGdriveOAuthPopup()` util alongside the existing gdrive web module.
- `apps/web/src/features/envelopes/envelopesApi.ts` — `saveEnvelopeToGdrive(id, { folderId, folderName }, signal?)` → `POST /envelopes/${id}/gdrive/save`; extend the `Envelope` detail type with the `gdriveExport` field.
- Reuse the existing gdrive web client for `picker-credentials`, `oauth/url`, `accounts`.

## Error handling (reuse `GDriveErrorCode`)

| Situation | HTTP | code | client toast |
|---|---|---|---|
| flag off | 404 | `not_found` | (route hidden — shouldn't reach) |
| not the owner / no envelope | 404 | `envelope_not_found` | "Envelope not found." |
| envelope not sealed | 409 | `envelope_not_sealed` | "This envelope isn't sealed yet." (row should be locked anyway) |
| no connected account | 409 | `gdrive_not_connected` | "Connect Google Drive to save here." + Connect action |
| token revoked / refresh failed | 409 | `gdrive_reconnect_required` | "Your Google connection expired." + Reconnect action |
| Drive 403 insufficient perms / folder gone | 403 | `gdrive_permission_denied` | "Can't write to that folder." → re-open the Picker |
| rate limited (ours or Drive 429) | 429 + `Retry-After` | `gdrive_rate_limited` | "Too many Drive requests — try again in {n}s." |
| Drive 5xx / network | 502 | `gdrive_upstream_error` | "Google Drive is having trouble — try again." |
| one of two uploads failed | 207 | (`error.code` in body) | "Sealed PDF saved; audit trail failed — retry." |

## Testing

- **API unit (jest + pg-mem):** happy path (stubbed `GoogleDriveClient` creates 2 files); re-push into the same folder → `filesUpdate` on the recorded ids; re-push into a different folder → `filesCreate`, record updated; `409 gdrive_not_connected` (no account); `409 envelope_not_sealed`; `429` when the rate limiter rejects; `403 gdrive_permission_denied` when Drive returns insufficient permissions; `404` when the flag is off; `207` partial when the second upload throws. Stub `GoogleDriveClient.filesCreate/filesUpdate`, `StorageService.download`, `GDriveService.getAccessToken`, `GDriveRateLimiter.take`.
- **API e2e:** extend the gdrive e2e harness (LocalStack KMS already wired) — `POST /envelopes/:id/gdrive/save` against the fake Google HTTP layer; assert the two upload calls + the export row + the response shape.
- **Migration convention test** (`apps/api/test/migrations-convention.spec.ts`) auto-covers the new up/down pair.
- **Web vitest:** `DownloadMenu` renders the gdrive row below the divider, locked when `available === false`, spinner when `inFlight === 'gdrive'`, fires `onSelect('gdrive')`. `EnvelopeDetailPage` — connected + folder pick → calls `saveEnvelopeToGdrive` → success toast + meta line refresh; not-connected → opens the OAuth popup first; the error codes map to the right toasts. (`google.picker`, `gapi`, `window.open` mocked.)
- **BDD e2e** (optional, mirrors the gdrive-import `.feature`): "Save a sealed envelope to Google Drive" — given connected + sealed, when I pick a folder, then the sealed + audit PDFs appear in that folder (fake Drive) and the toast links it. RED → GREEN.

## Out of scope (v1)

- Multi-account chooser — `gdriveMultiAccount` stays off; we use the single / most-recently-used account.
- Pushing the original PDF (only sealed + audit).
- Auto-push on seal completion (manual only).
- Changing sharing/permissions on the uploaded files (they inherit the folder's sharing).
- A separate `gdriveExportArtifacts` ramp flag (gate on the existing `gdriveIntegration`).

We do pass `supportsAllDrives:true` on the create/update calls so users who pick
a folder inside a Workspace shared drive aren't broken — that's a one-line
parameter, not a feature.
