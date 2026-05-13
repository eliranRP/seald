import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
  envelopes: EnvelopesTable;
  envelope_signers: EnvelopeSignersTable;
  envelope_fields: EnvelopeFieldsTable;
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
  refresh_token_ciphertext: Buffer;
  refresh_token_kms_key_arn: string;
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
export type FieldKindDb = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'email';
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
  | 'retention_deleted';
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
  delivery_mode: ColumnType<DeliveryModeDb, DeliveryModeDb | undefined, never>;
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

  access_token_hash: string | null;
  access_token_sent_at: ColumnType<
    Date | null,
    string | null | undefined,
    string | null | undefined
  >;
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
  | 'expired_to_signer';
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
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface IdempotencyRecordsTable {
  user_id: string;
  idempotency_key: string;
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: ColumnType<Record<string, unknown>, string, never>;
  created_at: ColumnType<Date, string | undefined, never>;
  expires_at: ColumnType<Date, string | undefined, never>;
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
