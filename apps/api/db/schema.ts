import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
  envelopes: EnvelopesTable;
  envelope_signers: EnvelopeSignersTable;
  envelope_fields: EnvelopeFieldsTable;
  envelope_events: EnvelopeEventsTable;
  envelope_jobs: EnvelopeJobsTable;
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
  | 'sent'
  | 'viewed'
  | 'tc_accepted'
  | 'field_filled'
  | 'signed'
  | 'all_signed'
  | 'sealed'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'reminder_sent'
  | 'session_invalidated_by_decline'
  | 'job_failed'
  | 'retention_deleted';
export type JobKindDb = 'seal' | 'audit_only';
export type JobStatusDb = 'pending' | 'running' | 'done' | 'failed';

export interface EnvelopesTable {
  id: Generated<string>;
  owner_id: string;
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
  tc_version: string;
  privacy_version: string;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  completed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  expires_at: ColumnType<Date, string, string | undefined>;
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
