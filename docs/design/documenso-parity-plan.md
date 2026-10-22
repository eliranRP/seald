# Documenso parity + backlog — implementation plan

**Status:** plan for one PR on branch `feat/documenso-parity`.
**Date:** 2026-10-22
**Audience:** the orchestrating agent and the sub-agents that build each work package (WP).
**Companions:** [MCP server](./mcp-server.md), [workflow automations](./workflow-automations.md).

## 1. Goal and scope

Close the product gaps against Documenso (github.com/documenso/documenso) without giving up what seald does better, and build the whole backlog (both design docs) in the same PR. Every new surface ships **dark**: each one has a feature flag in `packages/shared/src/feature-flags.ts` that is `false` in this PR.

### In scope

| Track | Content |
|---|---|
| Phase 0 — signing hardening | Fail loudly on a misconfigured signer (S.1 bug); B-LTA on; optional certificate pages inside `sealed.pdf`; a seal-sweep backstop; a stamped PDF for declined envelopes. |
| Multi-file envelopes | Several PDFs per envelope. Fields belong to a document. Each document is sealed separately, with one audit certificate for the envelope. |
| Phase 1 — workflow core | Sequential and grouped signing order (every recipient stays a signer, as today). Field `meta`, plus new kinds `name / number / radio / dropdown`. Date format and timezone per envelope. Sender-set expiry and reminder cadence. |
| Phase 2 — signer verification | An emailed one-time access code before the signer session starts. Optional re-verification before signing. Both are recorded in `verification_checks`, the hash-chained events, and the certificate. **SMS is deferred** (there is no SMS provider in the stack). |
| Phase 3 — platform | Hashed, scoped API keys. Public REST API v1 (**decision D1**). HMAC webhooks with SSRF checks that fail closed (this is automations A2). Bulk CSV send from a template. Template direct links. |
| Backlog: MCP | Every row of `mcp-server.md` § Pull requests: 0b, 0c, 0d, Insert A, 2, 3, 4, 5, 6, Before 3, 7d-a/b/c, 8a, 8b, 8d, 8c, 9, 7a, 7d, 7b, 7c, Insert B, Signing copy (placeholder only), 10, 11, 12, 13, 14, and the "Later" list (OAuth 2.1 is **decision D3**). Step 0a already shipped in `bff9c66`. |
| Backlog: automations | A1, A2, A2b, A3, A4 (merged into MCP Before 3), A5, A6, A7, A8. |
| i18n | Emails, signing pages and the audit certificate. Then the rest of the SPA. |

### Non-goals

- AI field and recipient detection.
- **New recipient roles** (approver, viewer, CC, assistant). The `signer_role` enum is not changed and every recipient stays `signatory`. Nothing in this PR (API, webhooks, MCP, certificate) exposes a role field beyond what exists today.
- **Organisations, teams and branding.**
- **Embed SDK** and embed presign tokens.
- **PDF placeholder text → fields** (`{{signature, r1}}`).
- SMS one-time codes.
- AES/QES (signing with a certificate per signer through a CSC trust provider). `SIGNATURE_LEVEL_NOTE` keeps saying SES.
- **Turning any flag on.** The MCP doc requires every flag flip to be its own change, after staging use and after the v0.4 legal text and the 30-day notice. This PR does not ship the legal text, the `TC_VERSION`/`PRIVACY_VERSION` bumps, or customer-facing claims for dark features.
- Slack actions (automations doc).

### Documenso vs. seald, in short

| | Documenso | seald | Action here |
|---|---|---|---|
| PAdES | B-T → B-LT → B-LTA in one libpdf call | B-T → B-LT; B-LTA built but `EMBED_LTA = false` | Turn on B-LTA (WP-01) |
| Timestamp servers | One chosen at random, no failover | `MultiTsaClient` rotates on failure | Keep ours |
| Audit trail | Plain rows, `onDelete: SetNull` | `prev_event_hash` chain, `chain_intact` | Keep ours; every new event type joins the chain |
| Certificate | Appended into the signed PDF, translated | Separate `audit.pdf` | Optional appended pages (WP-01), translated (WP-38) |
| Seal robustness | Re-seal from the original + a 15-minute sweep capped at 6 h | Re-seal from `original.pdf`; job retries, no sweep | Add the sweep (WP-02) |
| Signing order | Grouped order steps (plus 5 roles) | Columns exist but are unused | Order only (WP-05/06); roles are a non-goal |
| Fields | 11 kinds + Zod `fieldMeta` | 6 kinds, no meta | WP-07/08 |
| Signer auth | Account / passkey / TOTP / email code | Magic link only | Email code for guests (WP-10/11) |
| API and webhooks | tRPC→OpenAPI; webhook "secret" sent as a plain header | None | Scoped keys, MCP, HMAC-signed webhooks per the automations doc |
| Bulk / direct links | Yes | No | WP-36/37 |
| Multi-file | `EnvelopeItem` | One PDF | WP-03/04 |
| i18n | Lingui, 11 locales | None | WP-38–40 |

Things we deliberately do not copy: the webhook secret in a plain header, strong auth that needs an account, and action auth that covers only signature fields.

## 2. Schema changes and their order

**Decision: multi-file envelopes go first** (wave 2, migration 0022), ahead of signing order, fields, the API and MCP. Reasons:

1. `envelope_fields.document_id` changes the field contract. The MCP `tools/list` snapshot, the REST v1 contract and the template `field_layout` would each need a breaking change if they shipped first.
2. Sealing gets reworked once, for both Phase 0 and multi-file, instead of twice.
3. The 7d guided review, the signer fill view and the certificate all list pages by document. Building them on a single-document model would mean redoing them.

Backfill keeps existing envelopes working. Each envelope gets one `envelope_documents` row that points at the existing `{id}/original.pdf`. `sealed.pdf` and `audit.pdf` keep their current paths for that first document, so `/verify` and download links already handed out stay valid.

Every migration follows M.1–M.4:

- The down script lives in `down/`.
- Enum values are added with `add value if not exists`.
- Down scripts **clone the enum without the new labels**, as `down/0019_*.sql` does, and delete rows that use those labels first.
- Every new table gets `enable row level security` and no policies (the 0015 lesson).
- Backfills are idempotent.

| Id | File | Owner WP | Content |
|---|---|---|---|
| 0022 | `0022_envelope_documents.sql` | WP-03 | `envelope_documents(id, envelope_id, ord, title, original_file_path, original_sha256, original_pages, sealed_file_path, sealed_sha256)`. `envelope_fields.document_id` is added nullable, backfilled, then set `not null`. Unique `(envelope_id, ord)`. New event type `document_added`. |
| 0023 | `0023_signing_order.sql` | WP-05 | No enum or role change. New event type `step_started`. New column `envelope_signers.invited_at` (null until that signer's step is invited). Index `(envelope_id, signing_order)`. Backfill: `invited_at` from the existing `invite` email or `sent` event, so envelopes already out are unaffected. |
| 0024 | `0024_field_meta.sql` | WP-07 | `field_kind` gains `name`, `number`, `radio`, `dropdown`. New column `envelope_fields.meta jsonb not null default '{}'`. `envelopes` gains `date_format text` and `timezone text`. |
| 0025 | `0025_reminder_settings.sql` | WP-09 | `envelopes` gains `reminder_first_after_days`, `reminder_interval_days` and `reminder_max`, with check constraints that respect `MAX_AUTOMATED_REMINDERS`. |
| 0026 | `0026_signer_access_auth.sql` | WP-10 | `envelope_signers` gains `access_auth` (`none` or `email_otp`) and `action_auth` (`none` or `email_otp`). New table `signer_otp_challenges(id, signer_id, purpose, code_hash, attempts, expires_at, consumed_at)`. New event types `access_code_sent`, `access_code_verified`, `access_code_failed`. New `email_kind` `access_code`. |
| 0027 | `0027_signer_token_dispatch.sql` | WP-13 | MCP Insert A. Signer tokens are minted at dispatch; payloads keep only an id. |
| 0028 | `0028_api_keys.sql` | WP-14 | The `api_keys` table from MCP § API keys, as written. New `email_kind` `api_key_created`. |
| 0029 | `0029_mcp_idempotency_uploads.sql` | WP-19 | MCP 8a idempotency columns and the `mcp_uploads` table from 8b. |
| 0030 | `0030_mcp_approvals.sql` | WP-21 | `mcp_approvals` (including `previous_token_hash` and `result_slug`) and the confirmation-token table. New `email_kind` `approval_request`. New event type `approval_decided`. |
| 0031 | `0031_automations.sql` | WP-28 | The automations data model (A1) as written, including `envelopes.source_template_id`, the secret ciphertext columns (A2) and the failure counter (A8). |
| 0032 | `0032_bulk_batches.sql` | WP-36 | `bulk_batches` and `bulk_batch_rows`. |
| 0033 | `0033_template_direct_links.sql` | WP-37 | `template_direct_links(id, template_id, token_hash, prefix, signer_slot, enabled, created_at, revoked_at)`. New `envelopes.source` (`app`, `template`, `direct_link`, `api`, `mcp`, `bulk`). |
| 0034 | `0034_automation_email_copy.sql` | WP-33 | A7 suppression list for the stop link, and the daily cap counters. |
| 0035 | `0035_locales.sql` | WP-38 | `envelopes.locale` and `envelope_signers.locale`, checked against `SUPPORTED_LOCALES`. |
| 0036 | `0036_mcp_oauth.sql` | WP-27 | OAuth 2.1 grants (only if D3 = build). |

Each id is reserved for its owning WP. Two parallel WPs must not take the same id. If a WP is dropped, its id stays unused, because the runner globs files and gaps are harmless.

## 3. Rules for every work package

- **Model tier (user mandate).**
  - `opus`: architectural, sealing, auth, crypto, security-critical work, and the merge orchestrator.
  - `sonnet`: medium-complexity features.
  - `haiku`: mechanical, fully specified tasks.
  - Opus reviews every haiku and sonnet diff before it merges into the branch.
- **Hot files** are edited only by the orchestrator at merge time, or only in the declared append-only spot:
  - `envelopes.repository.pg.ts` (1717 lines): new queries go in new files under `apps/api/src/<module>/*.repository.pg.ts`. The legacy file only gets the minimal edits a WP declares.
  - `envelope-contract.ts` (`EVENT_TYPES`): append only.
  - `feature-flags.ts`: pre-seeded in WP-00.
  - `app.module.ts`, `AppRoutes.tsx`, `apps/landing/_worker.js`, `.github/workflows/ci.yml`, `CLAUDE.md`.
- **Service layer first.** HTTP, REST v1 and MCP controllers are thin adapters over services (MCP-first rule 2).
- **Every new event type** goes through `appendEvent`, so it joins the chain (S.6). The canonical JSON helper is imported, never reimplemented.
- **Tests:**
  - API: jest unit tests next to the code, plus e2e in `apps/api/test` for every new route.
  - Web: vitest with role/name queries (rule 4.6), and a story for every new component (Chromatic).
  - Any change that touches sealing must keep `pades-verify` green.
- **Each WP ends with** the local gate (`pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test`) and `pnpm --filter api test:e2e` when it adds routes or migrations.
- **Missing skills.** The `seald-react-pr-review` and `seald-qa-validation` skills named in CLAUDE.md are **not installed in this cloud container**. Opus runs their checklists by hand from `docs/agents/PR_REVIEW_CHECKLIST.md` and `docs/agents/DESIGN_REVIEW.md`, and the PR body records that.

## 4. Work packages

The **Owns** line lists the files a WP may create or edit freely. Anything else is a declared minimal edit, or goes to the orchestrator.

### WP-00 — Flag and contract seeding · `haiku` · wave 0
- **Goal:** add every new flag up front, set to `false`, so parallel WPs do not collide in `feature-flags.ts`:
  - `multiDocumentEnvelopes`, `signingOrder`, `fieldMetaV2`, `customReminders`, `signerAccessAuth`, `appendCertificate`
  - `mcpServer`, `workflowAutomations`, `publicApi`, `bulkSend`, `directLinks`, `i18n`
- **Also:** extend the `FeatureFlag` union, and add a `requireFlag` helper in `apps/api/src/common/feature-flag.guard.ts` that returns 404, modelled on the gdrive controller.
- **Owns:** `packages/shared/src/feature-flags.ts`, `apps/api/src/common/feature-flag.guard.ts`.
- **Acceptance:** a unit test asserts every flag is `false`.

### WP-01 — Sealing hardening · `opus` · wave 1
- **Goal:**
  1. **S.1 fix in `sealing.module.ts`.** If `PDF_SIGNING_PROVIDER` is `kms` but key id, region or cert is missing, throw at startup. If it is `local` but the P12 path or password is missing or the file does not exist, throw. `sslcom` throws `not implemented`; the enum value stays because it is in `env.schema.ts`. Noop is allowed only when `PDF_SIGNING_PROVIDER` is unset, and in production also needs `PDF_SIGNING_ALLOW_NOOP=true`.
  2. **B-LTA.** Set `EMBED_LTA = true` when the TSA is configured. Extend `scripts/verify-pades.ts` to assert a `/DocTimeStamp` after the DSS.
  3. **Optional appended certificate** (flag `appendCertificate`). Render the certificate pages with the existing React-PDF builder in a "pre-seal" mode before `pades.sign`. That mode leaves out the sealed SHA-256 (it would be circular) and shows the original hash and the event chain head. `audit.pdf` stays as the record that carries the sealed hash.
  4. **Declined/canceled stamp.** `audit_only` also writes a `declined.pdf`: the original with a "Declined — not signed" banner on every page, PAdES-sealed so its origin can be checked. Download `kind=declined`.
  5. Fix the stale comments in `sealing.service.ts` lines 83–91 and 95.
- **Owns:** `apps/api/src/sealing/{sealing.module,sealing.service,dss-injector,archive-timestamp,audit-pdf}.ts*`, `apps/api/scripts/verify-pades.ts`, `apps/api/src/sealing/__tests__/**`.
- **Acceptance:**
  - Module-factory tests cover each misconfiguration and assert it throws.
  - e2e seals a sample; `pades-verify` reports B-LTA.
  - A declined e2e asserts `declined.pdf` exists and verifies.
- **Flag:** `appendCertificate` (only for item 3).

### WP-02 — Seal sweep backstop · `sonnet` · wave 1
- **Goal:** add `POST /internal/cron/seal-sweep` and a 15-minute worker tick. It finds envelopes that are in `sealing`, or fully signed in `awaiting_others`, where any of these holds:
  - there is no `envelope_jobs` row;
  - the job is `failed` but has attempts left;
  - the job has been `running` for more than 15 minutes (reclaim).
  
  It re-queues them. The `all_signed` event must be older than 15 minutes and younger than 6 hours. A deterministic idempotency key stops several instances from duplicating work.
- **Owns:** `apps/api/src/sealing/seal-sweep.service.ts`, `apps/api/src/sealing/seal-sweep.repository.pg.ts`, a route added to `cron/cron.controller.ts`.
- **Acceptance:**
  - A unit test for each case.
  - An e2e test kills the job mid-run, and the sweep completes the seal.
  - Poison-pill envelopes older than 6 hours are logged and left alone.

### WP-03 — Multi-file envelopes (API + sealing) · `opus` · wave 2 · migration 0022
- **Goal:**
  - Upload adds a document: `POST /envelopes/:id/documents`, up to 10 documents and 25 MB each, and delete/reorder on drafts.
  - Fields carry `document_id`, and `pdf-inspection` runs per document.
  - Sealing loops over documents: burn in each one, sign it, then DSS/LTA. The first document keeps the legacy paths; others use `{id}/documents/{doc_id}/sealed.pdf`. One `audit.pdf` lists every document's original and sealed hash.
  - `/verify` returns `documents[]` (the legacy single fields remain, mirroring document 1).
  - Downloads take `?document_id=`, plus a zip of everything.
- **Owns:** `apps/api/src/envelopes/documents/**` (new controller, service and repository), sealing per-document loop changes (after WP-01 merges), `verify/*`, `packages/shared/src/envelope-contract.ts` (documents schema, append only).
- **Depends on:** WP-01.
- **Acceptance:**
  - A migration up/down/up test.
  - Legacy envelopes seal unchanged (byte-compare the burn-in of a fixture).
  - A 3-document e2e seals 3 PDFs; each passes `pades-verify`.
  - `/verify` contract test.
- **Flag:** `multiDocumentEnvelopes` gates only the API that adds more than one document. With the flag off, the single-document path runs through the new tables.

### WP-04 — Multi-file envelopes (web) · `sonnet` · wave 3
- **Goal:**
  - Upload page accepts several files.
  - Editor has a document switcher rail.
  - Signer fill and review views move across documents with "next field".
  - Verify page lists each document.
- **Owns:** `apps/web/src/features/documentEditor/documents/**`, `apps/web/src/features/signingFill/DocumentRail*`, edits in `UploadPage` and `VerifyPage`.
- **Depends on:** WP-03.
- **Acceptance:** vitest for the switcher and next-field across documents; stories; a Playwright happy path with 2 documents.

### WP-05 — Signing order (API) · `opus` · wave 3 · migration 0023
- **Goal:**
  - Roles do not change: every recipient is a signer, and the existing send rule (at least one required signature or initials field per signer) stays.
  - **Order:** `delivery_mode = sequential` means steps are groups of signers with equal `signing_order` who sign at the same time. A new `SigningOrderService`:
    - computes `activeStep(envelope)`, the lowest `signing_order` with an unsigned signer;
    - makes `send()` invite only step 1 and set `invited_at`;
    - on `submit`, when the step is complete, invites the next step and appends `step_started` (chained event).
  - `/sign/start` for a signer whose step is not active yet returns `409 not_your_turn` (the link only goes out when the step starts, so this is a guard).
  - Parallel mode keeps today's behaviour.
  - Reminders and expiry emails only target signers with `invited_at` set and not signed.
  - A decline in any step ends the envelope, as today.
- **Owns:** `apps/api/src/signing/signing-order.service.ts`, `signing-order.repository.pg.ts`, and declared edits in `envelopes.service.send`, `signing.service.{startSession,submit}` and `reminders/reminder-eligibility.ts`.
- **Depends on:** WP-03.
- **Acceptance:**
  - Unit tests for the step matrix (1–3 steps, 1–3 signers per step, a decline mid-step).
  - e2e for sequential with 3 signers across 2 steps (step 2 gets no invite until step 1 is done).
  - The certificate lists each signer's order and invite time.
- **Flag:** `signingOrder` (with the flag off, the API rejects `delivery_mode = sequential`).

### WP-06 — Signing order (web) · `sonnet` · wave 4
- **Goal:**
  - Recipient editor gets a "Sign in order" toggle, drag to reorder, and a "same step as above" toggle. Rows use the signer id as the key, never the index (rule 4.3).
  - Detail page shows a step timeline (waiting / invited / signed).
  - Templates store the order and the delivery mode.
- **Owns:** `apps/web/src/features/signers/signingOrder/**`, edits in `EnvelopeDetailPage`.
- **Depends on:** WP-05.
- **Acceptance:** vitest plus stories; a Playwright run for a 2-step envelope.

### WP-07 — Field meta + new kinds (API) · `sonnet` · wave 3 · migration 0024
- **Goal:**
  - `packages/shared/src/field-meta.ts` holds a Zod discriminated union of options per kind:
    - common: label, placeholder, required, readOnly, fontSize 8–96;
    - text: characterLimit;
    - number: min, max, decimals;
    - radio and dropdown: options[1..50] and default.
  - Placement validates meta.
  - `fillField` validates the value against kind and meta. Date and email values are validated too, closing a current gap.
  - The `name` kind is auto-filled from the signer's name and can be edited.
  - Burn-in draws the new kinds: radio as a selected circle, dropdown and number as text.
  - Envelope `date_format` and `timezone` drive how date fields render.
  - Template `field_layout` accepts meta.
- **Owns:** `packages/shared/src/field-meta.ts`, `apps/api/src/signing/field-value-validator.ts`, `apps/api/src/sealing/burn-in-fields.ts`, `apps/api/src/envelopes/field-placement.service.ts`, `signing/dto/fill-field.dto.ts`, and a one-line delegate in `signing.service.fillField`.
- **Depends on:** WP-03 (`document_id`). Merges after WP-05.
- **Acceptance:** a validator table test for every kind; a burn-in snapshot per kind; template round-trip.
- **Flag:** `fieldMetaV2`.

### WP-08 — Field meta (web) · `sonnet` · wave 4
- **Goal:**
  - Palette gains name, number, radio and dropdown.
  - A properties panel edits meta.
  - Signer inputs for each kind enforce the same Zod schema on the client.
  - Envelope settings pick date format and timezone.
- **Owns:** `apps/web/src/features/documentEditor/fieldProperties/**`, `apps/web/src/features/signingFill/inputs/**`, `components/FieldPalette`.
- **Depends on:** WP-07.

### WP-09 — Sender expiry + reminder cadence · `haiku` · wave 2 · migration 0025
- **Goal:**
  - Send-step controls: "Expires in" (7, 14, 30, 60, 90 days, or a date) and a reminder cadence (first after N days, every M days, at most K).
  - The API sends `expires_at` (already accepted by `PatchEnvelopeDto`) and the new columns.
  - `reminder-eligibility.ts` reads per-envelope values, falling back to today's defaults.
- **Owns:** `apps/web/src/features/envelopes/SendSettings*`, `apps/api/src/reminders/reminder-eligibility.ts`, `packages/shared/src/reminders.ts`.
- **Acceptance:** an eligibility unit table; vitest for the controls.
- **Flag:** `customReminders`.

### WP-10 — Signer access code (API) · `opus` · wave 4 · migration 0026
- **Goal:**
  - **Access code.** When a signer has `access_auth = email_otp`, `POST /sign/start` returns `access_code_required` and does not issue a session. `POST /sign/access-code/send` sends a 6-digit code; `POST /sign/access-code/verify` checks it and then issues the 30-minute session.
    - The code hash is HMAC-SHA256 with a server key (`SIGNER_OTP_KEY`).
    - Codes last 10 minutes; at most 5 attempts per code and 5 sends per hour.
    - Comparison is constant-time, and the code is consumed on success.
  - **Action re-verify.** With `action_auth = email_otp`, `POST /sign/submit` needs a fresh code (`purpose = action`) for every signer, not only for signature fields.
  - **Record keeping.** The method, a masked address and the time are written to `verification_checks`, to chained events, and to a certificate line ("Identity check: emailed one-time code to j***@example.com").
- **Owns:** `apps/api/src/signing/access-auth/**`, the `email/templates/access_code/**` template, and a declared edit in `signing.service.startSession` / `submit`.
- **Depends on:** WP-05.
- **Acceptance:** unit tests for expiry, attempt limits, replay and rate limit; e2e for gated start → verify → submit; the certificate line test.
- **Flag:** `signerAccessAuth`.
- **Claims:** `product-claims.ts` stays SES. The certificate says "emailed one-time code", never "verified identity".

### WP-11 — Signer access code (web) · `sonnet` · wave 5
- **Goal:**
  - `/sign/:id` shows a code-entry step before prep, with an accessible input (`autocomplete=one-time-code`), resend and errors.
  - The review step asks for a code when the action needs it.
  - Sender recipient editor gets a "Require email code" toggle per recipient and for the whole envelope.
- **Owns:** `apps/web/src/features/signing/accessCode/**`, `apps/web/src/features/signers/accessAuth/**`.
- **Depends on:** WP-10.

### WP-12 — MCP 0b + 0c + 0d · `sonnet` · wave 1
- **Goal:**
  - 0b: `GDriveService.listFiles`, conversion start and `DriveImportService` move out of the Drive controller and the browser.
  - 0c: `TemplateApplyService` moves the template layout expansion to the server.
  - 0d: eslint `no-restricted-imports` for `src/mcp`.
  - No behaviour change.
- **Owns:** `apps/api/src/integrations/gdrive/**` (service extraction), `apps/api/src/templates/template-apply.service.ts`, `UseTemplatePage` (switch to the server endpoint), `apps/api/.eslintrc*`.
- **Acceptance:** existing tests pass unchanged; new service unit tests.

### WP-13 — MCP Insert A: tokens minted at dispatch · `opus` · wave 1 · migration 0027
- **Goal:**
  - Implemented as written in the MCP doc.
  - The outbound payload stores only the signer id. The email worker mints the token, writes its hash in the claim statement, and renders the link.
  - Reminders rotate the token at send time.
- **Owns:** `apps/api/src/email/email-worker.service.ts`, `apps/api/src/signing/signing-token.service.ts`, the outbound repository.
- **Acceptance:**
  - No `?t=` in any stored payload (a scanner test).
  - A retry re-mints.
  - Older links stop working once a new one goes out.

### WP-14 — API keys (MCP step 2) · `opus` · wave 2 · migration 0028
- **Goal:** implement MCP § API keys exactly:
  - generation, checksum, `prefix` and SHA-256 hash;
  - a cap of 10 under an advisory lock;
  - the `amr` fresh-login check for `envelopes:send`;
  - the creation email, revocation and the 90/365-day expiry rules.
  
  Also add `ApiKeyAuthService.verify()`, which the MCP controller and the REST v1 guard reuse.
- **Owns:** `apps/api/src/api-keys/**`.
- **Acceptance:** every rule in the doc has a test; an e2e for the credential boundary (a key on `/envelopes/*` and `/sign/*` gets 401).

### WP-15 — Shared UI (MCP Before 3 = automations A4) · `sonnet` · wave 1
- **Goal:** `SecretOnceSheet`, `RunList`, `Checkbox`, `CodeSnippet`, the header bell, and promoting `MWBottomSheet` and `ReminderToggle` into `components/`.
- **Owns:** `apps/web/src/components/{SecretOnceSheet,RunList,Checkbox,CodeSnippet,HeaderBell,MWBottomSheet}/**`.
- **Acceptance:** stories and vitest for each; existing imports updated.

### WP-16 — Developers settings page (MCP step 3) · `sonnet` · wave 3
- **Goal:** as written in the doc: `/settings`, `/settings/developers` and the mobile variants, one-tap create, a show-once sheet, connect snippets, and nothing shown when the flag is off.
- **Owns:** `apps/web/src/pages/Settings*/**`, `apps/web/src/features/developers/**`.
- **Depends on:** WP-14, WP-15.
- **Note:** routes are added to `AppRoutes.tsx` and `_worker.js` by the orchestrator.

### WP-17 — MCP transport + read tools (steps 4, 5, 6) · `opus` · wave 3
- **Goal:**
  - `POST /mcp` Streamable HTTP, `McpAuthGuard`, protocol negotiation, `route-coverage.ts`.
  - Zod 4 `toJSONSchema`, a `tools/list` snapshot, and an SDK-client e2e.
  - Tools: `me_get`, `envelopes_search`, `envelopes_get`, `envelopes_status`, `envelopes_download_url`, `envelopes_list_pending`. These are document-aware: they return `documents[]`.
- **Owns:** `apps/api/src/mcp/**`.
- **Depends on:** WP-03, WP-14.
- **Acceptance:** the doc's test plan for steps 4–6; 404 when the flag is off.
- **Flag:** `mcpServer`.

### WP-18 — MCP 7d-a / 7d-b / 7d-c · `haiku` · wave 1
- **Goal:**
  - 7d-a: signer-colour tokens in `theme.ts`, replacing the duplicated palettes (fixes the F8 duplicate-colour bug).
  - 7d-b: a read-only `FieldTile`.
  - 7d-c: a validated, same-site `?next=` limited to `/approve/…`, and the review route exempted from the ≤640 px redirect.
- **Owns:** `apps/web/src/styles/theme.ts`, `apps/web/src/components/FieldTile/**`, the sign-in `next` helper.
- **Acceptance:** a unit test for the `next` validator (open-redirect cases); stories.

### WP-19 — MCP 8a, 8b, 8d, 8c · `opus` · wave 4 · migration 0029
- **Goal:** the idempotency framework, `documents_upload` plus the presigned PUT and `_complete`, `gdrive_import` / `gdrive_search_files` / `gdrive_list_files`, and a draft-only `envelopes_prepare`. All of this is multi-document: `documents_upload` attaches one document each.
- **Owns:** `apps/api/src/mcp/tools/{documents,gdrive,prepare}/**`, `apps/api/src/mcp/idempotency/**`, storage presign additions in `storage/storage.service.ts` (declared).
- **Depends on:** WP-17, WP-12.

### WP-20 — MCP step 9: suggest and place fields · `sonnet` · wave 5
- **Goal:** suggestions never write; placement checks that signers belong to the draft; drafts only. Uses the `field-meta` schema.
- **Owns:** `apps/api/src/mcp/tools/fields/**`.
- **Depends on:** WP-07, WP-19.

### WP-21 — Approvals API (7a, 7c, 7d server side) · `opus` · wave 5 · migration 0030
- **Goal:**
  - The approval email, the public `/approve` page API, `subject_hash`, and the token in the fragment or POST body.
  - CSRF and Origin checks, flood limits, and the Resend circuit breaker.
  - The 12-hour `amr` rule, re-minting on edit with `previous_token_hash`, approval-aware tool results, and `approvals_get`.
  - All as specified in the doc.
- **Owns:** `apps/api/src/approvals/**`, the `email/templates/approval_request/**` template.
- **Depends on:** WP-17, WP-13.
- **Acceptance:** the doc's 7a/7c/7d test plan; e2e for every branch (known vs. new recipient, edit re-mint, deny without a session).

### WP-22 — Approvals UI (7a page, 7b queue, 7d guided review) · `sonnet` · wave 6
- **Goal:**
  - The standalone `/approve` page.
  - `/settings/approvals` and the bell.
  - The guided review: pages across documents, signer-coloured fields, a sticky Approve bar.
  - Screenshots at 390 and 1440; the approval-card story.
  - `_headers`/`_worker.js` frame-ancestors handling for `/approve/`, done by the orchestrator.
- **Owns:** `apps/web/src/features/approvals/**`, `apps/web/src/pages/Approve*/**`.
- **Depends on:** WP-21, WP-18, WP-15.

### WP-23 — Insert B certificate line + signing-copy slot · `haiku` · wave 6
- **Goal:**
  - When `metadata.mcp` is present, the certificate says "Approved by owner (email link / signed-in)" and "Sent via <key name>".
  - Add the `INTENT_TO_SIGN_MCP_NOTE` slot in `product-claims.ts`, holding today's approved sentence plus a `TODO(copy-approval)`. **The new copy needs Eliran's approval (decision D4).**
- **Owns:** `audit-pdf.tsx` (the mcp block only, after WP-01 merges), `product-claims.ts` (append).

### WP-24 — MCP steps 10 + 11: send, remind and cancel via approval · `opus` · wave 6
- **Goal:** as written in the doc, including the caps (20 sends and 25 new recipients) and bounce/complaint suspension. Sends respect signing order (WP-05) and access auth (WP-10).
- **Owns:** `apps/api/src/mcp/tools/{send,remind,cancel}/**`.
- **Depends on:** WP-21, WP-20, WP-23, WP-05.

### WP-25 — MCP steps 12, 13, 14 · `sonnet` · wave 6
- **Goal:** contacts tools, `envelopes_create_from_template` and `templates_get_schema` (built on WP-12's `TemplateApplyService`), `gdrive_disconnect`, and save-to-Drive through approval.
- **Owns:** `apps/api/src/mcp/tools/{contacts,templates,gdrive-write}/**`.
- **Depends on:** WP-21.

### WP-26 — MCP "Later" list · `sonnet` · wave 7
- **Goal:**
  - `envelopes_fix_signer` and `envelopes_change_expiry` through approval.
  - `envelopes_bulk_send_from_template` and `batches_get`, reusing the WP-36 service.
  - The automation tools (A3 lives in WP-30).
  - The agent activity list.
  - One-tap Review placement in the app send flow.
- **Owns:** `apps/api/src/mcp/tools/later/**`, `apps/web/src/features/agentActivity/**`.
- **Depends on:** WP-24, WP-36.

### WP-27 — MCP OAuth 2.1 · `opus` · wave 7 · migration 0036 · **decision D3**
- **Goal:** pre-registered ChatGPT/Claude clients, or CIMD; no open registration. Connected apps appear on the Developers page.
- **Owns:** `apps/api/src/mcp/oauth/**`.
- **Note:** this is build-only. Pre-registering with ChatGPT/Claude is an external step that is not done in this PR.

### WP-28 — Automations A1: tables, trigger row, matcher · `opus` · wave 2 · migration 0031
- **Goal:**
  - As written in the doc: the pending `automation_triggers` row is written inside the `appendEvent` transaction (a declared minimal edit to `envelopes.repository.pg.ts`).
  - Matching runs after commit, with a startup rescan and a 24-hour sweep.
  - The worker is off.
- **Owns:** `apps/api/src/automations/{automations.module,matcher,*.repository.pg}.ts`.
- **Acceptance:** "the matcher throws, submit succeeds, and the rescan inserts the run".

### WP-29 — Automations A2 + A2b: webhook action and test endpoint · `opus` · wave 4
- **Goal:**
  - The `Seald-Signature` HMAC over `t.rawBody`, plus rotation with `Seald-Signature-Previous`.
  - Secrets encrypted with `AUTOMATION_SECRETS_KEY`; create returns 503 when it is unset.
  - The full SSRF denylist, with an undici agent pinned to the checked IP and redirects refused.
  - Timeout 10 s, read at most 64 KB, and `locked_at` reclaim.
  - Event coverage: `envelope_sent`, `envelope_viewed`, `signer_signed`, `signer_declined`, `envelope_expired`, `envelope_sealed`. This is the "webhooks" item of Phase 3.
  - A2b `POST /automations/:id/test`, which returns `recipe_not_approved` for MCP recipes still waiting on approval.
- **Owns:** `apps/api/src/automations/actions/webhook/**`, `apps/api/src/automations/ssrf/**`.
- **Depends on:** WP-28. The A2b part merges after WP-21.
- **Acceptance:** an SSRF table test covering every CIDR in the doc, IPv4-mapped addresses, 6to4 and DNS rebinding; an HMAC verify snippet test; a ±300 s window test.

### WP-30 — Automations A3 tools · `sonnet` · wave 5
- **Goal:** the MCP tools list, upsert, enable, list runs, get run and retry. `automations:write` is off by default. External destinations go through approval.
- **Owns:** `apps/api/src/mcp/tools/automations/**`, `apps/api/src/automations/automations.service.ts`.
- **Depends on:** WP-29, WP-17.

### WP-31 — Automations A5 UI · `sonnet` · wave 6
- **Goal:** a gallery, one-tap create, a list with switches, a show-once secret, run history with Retry/Fix, and a "Rotate secret" action.
- **Owns:** `apps/web/src/features/automations/**`.
- **Depends on:** WP-29, WP-15.

### WP-32 — Automations A6 Drive-save recipe · `sonnet` · wave 6
- **Goal:** `sealed_save_drive` with the default folder "My Drive / Seald", still `drive.file`. Multi-document: upload every sealed PDF plus `audit.pdf`.
- **Owns:** `apps/api/src/automations/actions/gdrive/**`.

### WP-33 — Automations A7 email copy · `sonnet` · wave 6 · migration 0034
- **Goal:** `email_copy` with the legal footer, a stop link and a cap of 50 a day, plus `legal-footer.contract.spec.ts`.
- **Owns:** `apps/api/src/automations/actions/email/**`, `email/templates/automation_copy/**`.

### WP-34 — Automations A8 auto-disable · `haiku` · wave 6
- **Goal:** disable a recipe after 20 consecutive failures, and email the owner.
- **Owns:** `apps/api/src/automations/auto-disable.ts`, `email/templates/automation_disabled/**`.

### WP-35 — Public REST API v1 · `sonnet` · wave 5 · **decision D1**
- **Goal:**
  - `/api/v1/*` thin adapters over the same services: envelopes CRUD, documents, fields, send, status, download, templates, contacts.
  - Auth is `ApiKeyGuard` (WP-14's verifier) with the same scopes. `send`, `remind` and `cancel` return `202 approval_pending` unless the key has `require_owner_approval = false`; that uses the same approval path as MCP.
  - An OpenAPI document is generated from the Zod contracts.
- **Owns:** `apps/api/src/public-api/**`.
- **Depends on:** WP-14, WP-21, WP-24.
- **Flag:** `publicApi`.
- **Note:** this changes the MCP doc's credential boundary ("keys only on `/mcp`"). The doc gets amended in WP-41.

### WP-36 — Bulk CSV send from a template · `sonnet` · wave 5 · migration 0032
- **Goal:**
  - Upload a CSV with columns `recipient_<slot>_name` and `recipient_<slot>_email` per template signer slot.
  - Per-row validation returns structured errors.
  - Capped at 100 rows in the app, and 20 for MCP per the doc.
  - A batch worker creates and sends envelopes through `EnvelopesService` and emails a summary when done.
  - The SPA has an upload, preview table and progress view.
- **Owns:** `apps/api/src/bulk/**`, `apps/web/src/features/bulkSend/**`, `email/templates/bulk_complete/**`.
- **Depends on:** WP-12 (`TemplateApplyService`), WP-05.
- **Flag:** `bulkSend`.

### WP-37 — Template direct links · `sonnet` · wave 5 · migration 0033
- **Goal:**
  - A template owner enables a link bound to one signer slot.
  - Public `/d/:token`: the visitor enters a name and email, gets an emailed access code (WP-10, mandatory here to limit abuse), and the server creates an envelope with `source = direct_link`. The other template recipients follow in order.
  - The link can be disabled or rotated, with rate limits per IP and per link.
  - The orchestrator adds `/d/` to `SPA_PREFIXES` in `_worker.js` and to `AppRoutes.tsx`.
- **Owns:** `apps/api/src/direct-links/**`, `apps/web/src/features/directLinks/**`, `apps/web/src/pages/DirectLinkPage/**`.
- **Depends on:** WP-10, WP-12.
- **Flag:** `directLinks`.

### WP-38 — i18n infrastructure · `sonnet` · wave 1 (scaffold) + wave 5 (locale columns) · migration 0035
- **Goal:**
  - **Web:** `i18next` + `react-i18next`, with catalogs in `packages/shared/locales/<lng>/*.json`, `dir="rtl"` support, and locale chosen from `navigator.language` or the envelope locale.
  - **API:** email templates move to `templates/<kind>/<locale>/`, falling back to `en`. React-PDF certificate strings come from the same catalogs. The certificate font must cover Hebrew.
  - The envelope locale picker lives in send settings.
- **Owns:** `apps/web/src/lib/i18n/**`, `packages/shared/locales/**`, `apps/api/src/email/template-loader.ts`, `apps/api/src/i18n/**`.
- **Flag:** `i18n` (when off, everything is `en`).
- **Note:** legal strings follow **decision D2**.

### WP-39 — i18n string extraction · `haiku` · wave 7
- **Goal:** move every hard-coded string in signing pages, emails and the certificate (and then the rest of the SPA) to catalog keys. No wording changes.
- **Owns:** a key-only edit across `apps/web/src/**` and `email/templates/**`. It runs last, alone, so it collides with nothing.
- **Acceptance:** `pnpm i18n:check` (a new script) finds no missing keys; tests that query by name still pass in `en`.

### WP-40 — Translations · dropped (D2: English only)
- **Goal:** translate the catalogs for the locales chosen in D2.
- **Owns:** `packages/shared/locales/<lng>/**` (not `en`).

### WP-41 — Docs · `haiku` · wave 7
- **Goal:**
  - CLAUDE.md: new env vars (`SIGNER_OTP_KEY`, `AUTOMATION_SECRETS_KEY`, `PDF_SIGNING_ALLOW_NOOP`), new rules (S.7 B-LTA, S.8 multi-document sealing), and the migration list.
  - Mark both design docs "Status: built dark", with links back to this plan.
  - The credential-boundary amendment, if D1 = REST.
  - A self-hosting section.
- **Owns:** `CLAUDE.md`, `docs/**`.

(WP-42, WP-43 and WP-44 — the embed SDK, placeholder fields, and organisations/teams — were removed by the user's decision. The numbers are left unused.)

## 5. Waves and merge order

Each WP runs in its own git worktree, branched from the current tip of `feat/documenso-parity`. After each wave:

1. The orchestrator (opus) merges the wave's WPs in the order listed. It resolves hot-file conflicts and edits `AppRoutes.tsx`, `_worker.js` and `app.module.ts`.
2. It runs the full local gate and e2e.
3. It pushes. **CI must be green on that push before the next wave starts.**

Each WP lands as its own commit series (`type(scope): … (WP-xx)`), so the one PR stays reviewable commit by commit.

| Wave | WPs (parallel) | Merge order |
|---|---|---|
| 0 | WP-00 | 00 |
| 1 | WP-01, WP-02, WP-12, WP-13, WP-15, WP-18, WP-38 (scaffold only) | 01 → 02 → 13 → 12 → 15 → 18 → 38 |
| 2 | WP-03, WP-09, WP-14, WP-28 | 03 → 28 → 14 → 09 |
| 3 | WP-04, WP-05, WP-07, WP-16, WP-17 | 05 → 07 → 17 → 04 → 16 |
| 4 | WP-06, WP-08, WP-10, WP-19, WP-29 (A2) | 10 → 19 → 29 → 06 → 08 |
| 5 | WP-11, WP-20, WP-21, WP-30, WP-36, WP-37, WP-38 (locale columns) | 21 → 20 → 36 → 37 → 30 → 38 → 11 |
| 6 | WP-22, WP-23, WP-24, WP-25, WP-29 (A2b), WP-31, WP-32, WP-33, WP-34, WP-35 | 23 → 24 → 25 → 29b → 35 → 33 → 34 → 32 → 22 → 31 |
| 7 | WP-26, WP-27, WP-45, WP-41, then WP-39 | 26 → 27 → 45 → 41 → 39 |

Where a wave has more than about 6 parallel WPs, the orchestrator caps concurrency at 5 worktrees and starts the rest as slots free up.

## 6. Risks and rollout

| Risk | Mitigation |
|---|---|
| Sealing regression (B-LTA, multi-document, appended certificate, declined stamp) | `pades-verify` on every push. Byte-compare the burn-in of a legacy fixture. Appended certificate behind a flag. B-LTA falls back to B-LT on failure (logged), the same way DSS falls back to B-T today. |
| S.1 throw breaks a host that runs Noop by accident | That is the intent. Release notes list `PDF_SIGNING_ALLOW_NOOP=true` for staging. Check prod env before deploy. |
| Migrations run at container boot on prod | All are idempotent. Backfills happen inside the migration; `not null` only after the backfill. No long locks (the tables are small). Every migration is tested up → down → up in e2e. Enum downs use the clone pattern. RLS is on for every new table. |
| PR size (estimated 30–40k changed lines) and an all-or-nothing revert | Commit series per WP. Flags are the kill switch. Waves give natural review checkpoints. A revert of a single WP's commits is possible because file ownership does not overlap. |
| Legal claims | `SIGNATURE_LEVEL_NOTE` unchanged (SES). The certificate says "emailed one-time code", never "identity verified". No marketing or legal copy for dark features. The v0.4 legal text and version bumps ship in the later flag-flip PRs, per the MCP doc. Translated legal strings follow D2. |
| Webhook SSRF and secrets | The doc's denylist, IP pinning, no redirects, `AUTOMATION_SECRETS_KEY` outside the database. The Terraform metadata hop limit of 1 ships with WP-29. |
| Resend quota (approval emails, codes, bulk) | A circuit breaker (WP-21), per-feature caps, and checking the free-tier quota before any flag flip. |
| MCP doc's "one feature per PR" rule | Replaced by the user's one-PR decision. Kept in spirit through one commit series per step, with flags off. |
| Missing seald skills in this container | Opus applies the checklists by hand; recorded in the PR body. |

**Rollout after merge:** each flag is turned on in its own small change, in this order:

1. `appendCertificate`, `customReminders`
2. `signingOrder`, `fieldMetaV2`, `multiDocumentEnvelopes`
3. `signerAccessAuth`
4. `bulkSend`, `directLinks`
5. `i18n`
6. `mcpServer` (after staging use with a real key, plus the legal text)
7. `workflowAutomations` (after A2b posts to a staging URL)
8. `publicApi`

## 7. Decisions (resolved 2026-10-22)

- **D1 — public REST API:** (a). Add `/api/v1` with the same keys, scopes and approval path as `/mcp`; WP-14 amends the MCP doc's "keys only on `/mcp`" line. WP-35 stays.
- **D2 — locales:** English only for now. WP-38 builds the full infrastructure (catalogs, template loader, certificate strings from catalogs) and WP-39 extracts strings, so a new locale is a catalog drop-in. RTL support and the Hebrew certificate font are not needed yet. **WP-40 is dropped.**
- **D2b — legal text:** legal and consent strings (`product-claims.ts`, ESIGN disclosure, terms) are never machine-translated. A future non-English locale shows them in English with a "translation for convenience" notice.
- **D3 — MCP OAuth 2.1:** build it now, dark behind `mcpServer` (WP-27 stays in wave 7).
- **D4 — intent-to-sign copy for MCP sends (WP-23):** the slot ships with today's sentence; final wording comes with the legal v0.4 flag-flip PR.
- **D5 — MCP full parity (2026-10-22):** every action a signed-in user can take in the web app gets an MCP tool. `route-coverage.contract.spec.ts` (WP-17) allows `excluded` only for routes with no user-facing action (signer-token routes reached by a signer link, verify, cron, OAuth browser callbacks); every other sender route must map to a `tool` or `planned`. The four actions the MCP doc excluded are exposed **behind owner approval** (same email-first Approve/Deny page as send, WP-21/WP-22), delivered by **WP-45**.

### WP-45 — MCP parity for the approval-gated actions · `opus` · wave 7
- **Goal:** tools for the four previously excluded actions, each returning `approval_pending` and executing only after the owner approves on the Approve/Deny page with a fresh sign-in (`amr` check, as for `envelopes:send`):
  1. `account_delete` → `DELETE /me` (approval page repeats the irreversible-deletion warning and requires typing the account email).
  2. `api_keys_create` / `api_keys_revoke` → the key is shown once **on the approval page only**, never in the tool result; an agent can never mint a key with more scopes than its own.
  3. `approvals_set_required` → toggles `require_owner_approval`; turning it **off** always needs approval, turning it on applies immediately.
  4. `envelopes_sign_as_signer` → for envelopes where the owner is a signer: the approval page *is* the signer's consent (ESIGN disclosure, intent-to-sign, field review) and applies the owner's saved signature/initials only on Approve; recorded as `signed` with `actor` = signer and `via=mcp_approval` in the hash chain and on the certificate. Never applies to other signers.
- **Owns:** `apps/api/src/mcp/tools/{account,api-keys,approvals-settings,sign-as-signer}.*`, approval kinds in the WP-21 module (declared minimal edit).
- **Depends on:** WP-14, WP-17, WP-21, WP-22, WP-24.
- **Acceptance:** each tool returns `approval_pending` and performs nothing until Approve; Deny/expiry leaves state unchanged; e2e for each; the parity spec has no `excluded` sender routes left.
- **Scopes:** new `account:admin`, `keys:admin`, `envelopes:sign`; none pre-checked on the Developers page.

