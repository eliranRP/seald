import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
  envelopes: EnvelopesTable;
  envelope_signers: EnvelopeSignersTable;
  envelope_fields: EnvelopeFieldsTable;
  envelope_documents: EnvelopeDocumentsTable;
  envelope_events: EnvelopeEventsTable;
  envelope_jobs: EnvelopeJobsTable;
  outbound_emails: OutboundEmailsTable;
  idempotency_records: IdempotencyRecordsTable;
  email_webhooks: EmailWebhooksTable;
  templates: TemplatesTable;
  // Migration 0012 — bookkeeping for deleted accounts. See the migration
  // header for the GDPR Art. 17(3)(b/e) carve-out rationale.
  deleted_user_tombstones: DeletedUserTombstonesTable;
  // Migration 0013 — Drive integration (Phase 5 WT-A).
  gdrive_accounts: GDriveAccountsTable;
  // Migration 0017 — "Save envelope artifacts to Google Drive" bookkeeping.
  gdrive_envelope_exports: GDriveEnvelopeExportsTable;
  // Migration 0028 — API keys for `/mcp` and `/api/v1` (WP-14).
  api_keys: ApiKeysTable;
  // Migration 0026 — emailed one-time codes for signers (WP-10).
  signer_otp_challenges: SignerOtpChallengesTable;
  // Migration 0029 — MCP staged uploads (WP-19).
  mcp_uploads: McpUploadsTable;
}

/** Migration 0026 (WP-10). `none` or the emailed one-time code. */
export type SignerAuthMethodDb = 'none' | 'email_otp';

/**
 * Migration 0026. One row per code sent. `code_hash` is hex HMAC-SHA256
 * under SIGNER_OTP_KEY, null until the worker mints the code at dispatch;
 * the code itself is never stored.
 */
export interface SignerOtpChallengesTable {
  id: Generated<string>;
  envelope_id: string;
  signer_id: string;
  purpose: 'access' | 'action';
  code_hash: string | null;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  expires_at: ColumnType<Date, string, string | undefined>;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  consumed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  locked_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  superseded_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Migration 0029 (WP-19). A file an MCP client staged before attaching it
 * to a draft. `id` is the tool-facing `document_id` / `upload_id`.
 */
export interface McpUploadsTable {
  id: Generated<string>;
  owner_id: string;
  storage_key: string;
  filename: string | null;
  mime: string | null;
  sha256: string | null;
  byte_length: number | null;
  page_count: number | null;
  thumbnail_url: string | null;
  source: ColumnType<'upload' | 'gdrive', 'upload' | 'gdrive' | undefined, never>;
  drive_file_id: string | null;
  drive_file_name: string | null;
  conversion_job_id: string | null;
  expires_at: ColumnType<Date, string, never>;
  completed_at: ColumnType<Date | null, string | null | undefined, string | null>;
  consumed_at: ColumnType<Date | null, string | null | undefined, string | null>;
  created_at: ColumnType<Date, string | undefined, never>;
}

/**
 * Migration 0028. Only the SHA-256 of the secret is stored. Revocation
 * sets `revoked_at` and keeps the row; account deletion cascades.
 */
export interface ApiKeysTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: ColumnType<string[], string[], string[]>;
  require_owner_approval: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  allow_new_recipients: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  always_require_signin: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  last_used_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  expires_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  revoked_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}

export interface GDriveEnvelopeExportsTable {
  id: Generated<string>;
  envelope_id: string;
  account_id: string;
  folder_id: string;
  folder_name: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  sealed_file_id: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  audit_file_id: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  last_pushed_at: ColumnType<Date, string | undefined, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface GDriveAccountsTable {
  id: Generated<string>;
  user_id: string;
  google_user_id: string;
  google_email: string;
  // NULL after disconnect. The connection row stays for the audit trail
  // (Google email, connected_at, deleted_at); the token does not.
  refresh_token_ciphertext: Buffer | null;
  refresh_token_kms_key_arn: string | null;
  scope: string;
  connected_at: ColumnType<Date, string | undefined, never>;
  last_used_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  deleted_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}

export interface DeletedUserTombstonesTable {
  user_id: string;
  email_hash: string;
  // Updatable on conflict: a re-run of the deletion path (e.g. after a
  // transient Supabase failure left the tombstone but not the auth-row
  // removal) refreshes the timestamp via `recordDeletion`'s upsert.
  deleted_at: ColumnType<Date, string | undefined, string | undefined>;
}

export type TemplateFieldTypeDb = 'signature' | 'initial' | 'date' | 'text' | 'checkbox';

/**
 * One field layout entry inside `templates.field_layout`. Mirrors the
 * `TemplateField` shape exported from packages/shared/src/templates.ts —
 * the canonical client-side type. See migration 0008 for the column comment.
 */
export interface TemplateFieldLayoutDb {
  type: TemplateFieldTypeDb;
  pageRule: 'all' | 'allButLast' | 'first' | 'last' | number;
  x: number;
  y: number;
  label?: string;
}

/**
 * `last_signers` row entries — captured on Send-and-update so the
 * next use of a template pre-fills the signer roster. Mirrors the
 * shared `TemplateLastSigner` type but lives here so the DB layer
 * has its own bound (we don't want a leak from the public contract
 * to drag the DB types into rebuilds on contract-only changes).
 */
export interface TemplateLastSignerDb {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface TemplatesTable {
  id: Generated<string>;
  owner_id: string;
  title: string;
  description: string | null;
  cover_color: string | null;
  field_layout: ColumnType<ReadonlyArray<TemplateFieldLayoutDb>, string, string | undefined>;
  tags: ColumnType<ReadonlyArray<string>, string, string | undefined>;
  last_signers: ColumnType<ReadonlyArray<TemplateLastSignerDb>, string, string | undefined>;
  // Storage object key (relative to STORAGE_BUCKET) for the saved
  // example PDF. Nullable — set by `POST /templates/:id/example` after
  // the row exists. Migration 0010.
  example_pdf_path: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  uses_count: ColumnType<number, number | undefined, number | undefined>;
  last_used_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface ContactsTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  email: string;
  color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export type EnvelopeStatusDb =
  | 'draft'
  | 'awaiting_others'
  | 'sealing'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';
export type DeliveryModeDb = 'parallel' | 'sequential';
export type SignerRoleDb = 'proposer' | 'signatory' | 'validator' | 'witness';
export type FieldKindDb =
  | 'signature'
  | 'initials'
  | 'date'
  | 'text'
  | 'checkbox'
  | 'email'
  // Migration 0024 (WP-07).
  | 'name'
  | 'number'
  | 'radio'
  | 'dropdown';
export type SignatureFormatDb = 'drawn' | 'typed' | 'upload';
export type ActorKindDb = 'sender' | 'signer' | 'system';
export type EventTypeDb =
  | 'created'
  | 'pdf_uploaded'
  | 'sent'
  | 'viewed'
  | 'tc_accepted'
  | 'esign_disclosure_acknowledged'
  | 'intent_to_sign_confirmed'
  | 'consent_withdrawn'
  | 'field_filled'
  | 'signed'
  | 'all_signed'
  | 'sealed'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'reminder_sent'
  | 'session_invalidated_by_decline'
  | 'session_invalidated_by_cancel'
  | 'job_failed'
  | 'retention_deleted'
  | 'document_added'
  | 'step_started'
  | 'access_code_sent'
  | 'access_code_verified'
  | 'access_code_failed';
export type JobKindDb = 'seal' | 'audit_only';
export type JobStatusDb = 'pending' | 'running' | 'done' | 'failed';

export interface EnvelopesTable {
  id: Generated<string>;
  // Migration 0012 — relaxed to nullable. The application service
  // detaches `owner_id` (sets it to NULL) on non-draft envelopes during
  // account deletion so the sealed record survives auth.users deletion;
  // the FK was also flipped from `on delete cascade` to `on delete set
  // null` as a safety net for raw deletes that bypass the service.
  // Drafts and templates are still hard-deleted, so a NULL owner_id
  // implies "preserved sealed record from a deleted account".
  owner_id: string | null;
  title: string;
  short_code: string;
  status: ColumnType<EnvelopeStatusDb, EnvelopeStatusDb | undefined, EnvelopeStatusDb | undefined>;
  // Migration 0023 (WP-05): updatable on drafts by the signing-order route,
  // and stamped at send with the mode in force.
  delivery_mode: ColumnType<DeliveryModeDb, DeliveryModeDb | undefined, DeliveryModeDb | undefined>;
  original_file_path: string | null;
  original_sha256: string | null;
  original_pages: number | null;
  sealed_file_path: string | null;
  sealed_sha256: string | null;
  audit_file_path: string | null;
  sender_email: string | null;
  sender_name: string | null;
  tc_version: string;
  privacy_version: string;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  completed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  expires_at: ColumnType<Date, string, string | undefined>;
  // Migration 0016 — short user-defined labels for filtering on the
  // dashboard. `jsonb` of a string array; API DTO enforces the
  // shape (max 10 tags, 32 chars each, lower-cased + de-duped).
  // Insert is optional because the column has a `default '[]'::jsonb`.
  tags: ColumnType<ReadonlyArray<string>, string | undefined, string | undefined>;
  // Migration 0020 — sender can turn daily unsigned-signer reminders off.
  // Default true so rows created before the column existed stay opted in.
  reminders_enabled: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  // Migration 0025 — per-envelope reminder cadence (defaults: 1, 1, 7).
  reminder_first_after_days: ColumnType<number, number | undefined, number | undefined>;
  reminder_interval_days: ColumnType<number, number | undefined, number | undefined>;
  reminder_max: ColumnType<number, number | undefined, number | undefined>;
  // Migration 0024 (WP-07) — how date fields render. Null keeps the text
  // the signer sent. Read and written only while `fieldMetaV2` is on.
  date_format: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  timezone: ColumnType<string | null, string | null | undefined, string | null | undefined>;
  // Migration 0026 (WP-10) — envelope default for the emailed one-time
  // code before access / before submit. Read only while `signerAccessAuth`
  // is on.
  access_auth: ColumnType<
    SignerAuthMethodDb,
    SignerAuthMethodDb | undefined,
    SignerAuthMethodDb | undefined
  >;
  action_auth: ColumnType<
    SignerAuthMethodDb,
    SignerAuthMethodDb | undefined,
    SignerAuthMethodDb | undefined
  >;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface EnvelopeSignersTable {
  id: Generated<string>;
  envelope_id: string;
  contact_id: string | null;
  email: string;
  name: string;
  color: string;
  role: ColumnType<SignerRoleDb, SignerRoleDb | undefined, SignerRoleDb | undefined>;
  signing_order: ColumnType<number, number | undefined, number | undefined>;
  // Migration 0023 (WP-05) — when this signer's step was invited. Null on
  // drafts and for later steps of a sequential envelope until they start.
  invited_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  // Migration 0026 (WP-10) — per-signer override; null inherits the
  // envelope's access_auth / action_auth.
  access_auth: ColumnType<
    SignerAuthMethodDb | null,
    SignerAuthMethodDb | null | undefined,
    SignerAuthMethodDb | null | undefined
  >;
  action_auth: ColumnType<
    SignerAuthMethodDb | null,
    SignerAuthMethodDb | null | undefined,
    SignerAuthMethodDb | null | undefined
  >;

  // Migration 0027 (MCP Insert A) — both are written by the email
  // dispatcher when it sends an invite or reminder: a fresh token's hash
  // and the send time. Null until the first invite goes out.
  access_token_hash: string | null;
  access_token_sent_at: ColumnType<
    Date | null,
    string | null | undefined,
    string | null | undefined
  >;
  // Migration 0020 — set when an automated reminder is claimed. Every
  // dispatched invite or reminder bumps access_token_sent_at (rotation).
  last_reminded_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  verification_checks: ColumnType<string[], string | undefined, string | undefined>;

  viewed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  tc_accepted_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  signed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  declined_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  decline_reason: string | null;

  signing_ip: string | null;
  signing_user_agent: string | null;

  signature_format: SignatureFormatDb | null;
  signature_image_path: string | null;
  signature_font: string | null;
  signature_stroke_count: number | null;
  signature_source_filename: string | null;

  // Initials capture is a *separate* artifact from the signature. Both
  // columns are nullable so legacy rows (pre-migration 0005) still work —
  // the burn-in falls back to signature_image_path when initials_image_path
  // is null. See migration 0005_signer_initials.sql.
  initials_format: SignatureFormatDb | null;
  initials_image_path: string | null;

  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EnvelopeFieldsTable {
  id: Generated<string>;
  envelope_id: string;
  signer_id: string;
  kind: FieldKindDb;
  page: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  required: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  link_id: string | null;
  value_text: string | null;
  value_boolean: boolean | null;
  filled_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  /**
   * Migration 0022 (WP-03). Not null; the `envelope_fields_default_document`
   * trigger fills document 1 when an insert leaves it out, so single-file
   * writers keep working.
   */
  document_id: ColumnType<string, string | undefined, string>;
  /**
   * Migration 0024 (WP-07). jsonb object, default `{}`. Written only while
   * `fieldMetaV2` is on; validated by the shared `parseFieldMeta`.
   */
  meta: ColumnType<Record<string, unknown>, string | undefined, never>;
}

/**
 * Migration 0022 (WP-03). One PDF of an envelope. `ord` 1 is mirrored to
 * the legacy `envelopes.original_*` / `sealed_*` columns by trigger.
 */
export interface EnvelopeDocumentsTable {
  id: Generated<string>;
  envelope_id: string;
  ord: number;
  title: string;
  original_file_path: string | null;
  original_sha256: string | null;
  original_pages: number | null;
  sealed_file_path: string | null;
  sealed_sha256: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
  /** Migration 0029 (WP-19). Name of the Drive file this document was imported from. */
  source_drive_file_name: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface EnvelopeEventsTable {
  id: Generated<string>;
  envelope_id: string;
  signer_id: string | null;
  actor_kind: ActorKindDb;
  event_type: EventTypeDb;
  ip: string | null;
  user_agent: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  /**
   * Tamper-evident hash chain. SHA-256 of the previous event row's canonical
   * JSON within the same envelope. NULL only for the genesis event. See
   * `event-hash.ts` for the canonicalization algorithm — it must match
   * exactly between insert (repository) and verify (controller) paths,
   * otherwise a freshly-written row would already report `chain_intact: false`.
   * Stored as `bytea`; reads come back as a Node Buffer in pg, and as a
   * Buffer-shaped Uint8Array in pg-mem.
   */
  prev_event_hash: ColumnType<Buffer | null, Buffer | null | undefined, Buffer | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EnvelopeJobsTable {
  id: Generated<string>;
  envelope_id: string;
  kind: JobKindDb;
  status: ColumnType<JobStatusDb, JobStatusDb | undefined, JobStatusDb | undefined>;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  max_attempts: ColumnType<number, number | undefined, number | undefined>;
  last_error: string | null;
  scheduled_for: ColumnType<Date, string | undefined, string | undefined>;
  started_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  finished_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type EmailKindDb =
  | 'invite'
  | 'reminder'
  | 'completed'
  | 'declined_to_sender'
  | 'withdrawn_to_signer'
  | 'withdrawn_after_sign'
  | 'expired_to_sender'
  | 'expired_to_signer'
  | 'signed_to_sender'
  | 'api_key_created'
  | 'access_code';
export type EmailStatusDb = 'pending' | 'sending' | 'sent' | 'failed';

export interface OutboundEmailsTable {
  id: Generated<string>;
  envelope_id: string | null;
  signer_id: string | null;
  kind: EmailKindDb;
  to_email: string;
  to_name: string;
  payload: ColumnType<Record<string, unknown>, string, string | undefined>;
  status: ColumnType<EmailStatusDb, EmailStatusDb | undefined, EmailStatusDb | undefined>;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  max_attempts: ColumnType<number, number | undefined, number | undefined>;
  scheduled_for: ColumnType<Date, string | undefined, string | undefined>;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  last_error: string | null;
  provider_id: string | null;
  source_event_id: string | null;
  /**
   * Stable idempotency key. Callers set this for notices that must be
   * sent once (per signature, per completion party). Omitted inserts
   * receive a random default so legacy rows stay unique without deduping
   * each other. Migration 0019.
   */
  dedupe_key: ColumnType<string, string | undefined, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface IdempotencyRecordsTable {
  user_id: string;
  idempotency_key: string;
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: ColumnType<Record<string, unknown>, string, string>;
  created_at: ColumnType<Date, string | undefined, string | undefined>;
  expires_at: ColumnType<Date, string | undefined, string | undefined>;
  /**
   * Migration 0029 (WP-19). Null while an MCP call holds the key and has
   * not stored its response yet.
   */
  completed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}

export interface EmailWebhooksTable {
  id: Generated<string>;
  provider: string;
  event_type: string;
  provider_id: string;
  payload: ColumnType<Record<string, unknown>, string, never>;
  received_at: ColumnType<Date, string | undefined, never>;
  processed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}
