import type { z } from 'zod';
import type { FieldSchema, SignatureFormat, SignerRole } from 'shared';
import type { Envelope, EnvelopeSigner, EnvelopeField, EnvelopeEvent } from './envelope.entity';

export type { Envelope, EnvelopeSigner, EnvelopeField, EnvelopeEvent };

/**
 * FieldKind comes from the Phase 3 wire contract's FieldSchema, not the
 * Phase 1 barrel re-export (which is a different enum). Derive it here.
 */
export type FieldKind = z.infer<typeof FieldSchema>['kind'];

type EnvelopeStatus = Envelope['status'];

export interface CreateDraftInput {
  readonly owner_id: string;
  readonly title: string;
  readonly short_code: string;
  readonly tc_version: string;
  readonly privacy_version: string;
  readonly expires_at: string; // ISO
}

export interface UpdateDraftMetadataPatch {
  readonly title?: string;
  readonly expires_at?: string;
  /**
   * Whole-array replace (semantics match the dashboard tag editor:
   * the user always submits the full new tag set). The repository
   * trusts the caller to have normalized the array.
   */
  readonly tags?: ReadonlyArray<string>;
}

export interface SetOriginalFileInput {
  readonly file_path: string;
  readonly sha256: string;
  readonly pages: number;
}

export interface AddSignerInput {
  readonly contact_id?: string | null;
  readonly email: string;
  readonly name: string;
  readonly color: string;
  readonly role?: SignerRole;
}

export interface CreateFieldInput {
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required?: boolean;
  readonly link_id?: string | null;
}

export interface SendDraftInput {
  readonly envelope_id: string;
  readonly signer_tokens: ReadonlyArray<{ signer_id: string; access_token_hash: string }>;
  /** Persisted on the envelope row so SigningService.decline can enqueue
   *  the withdrawal email to the sender without an auth.users lookup. */
  readonly sender_email: string;
  readonly sender_name: string | null;
}

export interface SignerFieldFillInput {
  readonly value_text?: string | null;
  readonly value_boolean?: boolean | null;
}

/**
 * `kind` discriminates the *capture target*, not the storage shape — both
 * variants share the same input columns. When `kind === 'initials'` the
 * adapter writes `initials_image_path` + `initials_format` instead of
 * `signature_image_path` + `signature_format` so a signer's drawn signature
 * and drawn initials no longer clobber each other on disk. Default
 * `'signature'` keeps the legacy single-image flow working untouched.
 */
export type SignatureKind = 'signature' | 'initials';

export interface SetSignerSignatureInput {
  readonly kind?: SignatureKind;
  readonly signature_format: SignatureFormat;
  readonly signature_image_path: string;
  readonly signature_font?: string | null;
  readonly signature_stroke_count?: number | null;
  readonly signature_source_filename?: string | null;
}

export interface SubmitResult {
  readonly signer: EnvelopeSigner;
  readonly all_signed: boolean;
  readonly envelope_status: EnvelopeStatus;
}

export interface ClaimedJob {
  readonly id: string;
  readonly envelope_id: string;
  readonly kind: 'seal' | 'audit_only';
  readonly attempts: number;
  readonly max_attempts: number;
}

/**
 * Per-signer data that the audit PDF renderer needs but that we deliberately
 * exclude from the public wire contract (EnvelopeSigner). Exposed via a
 * dedicated port so the domain Signer stays narrow while the server-side
 * audit artifact can render signature format, verification checks, and the
 * signing IP captured at submit time.
 */
export interface SignerAuditDetail {
  readonly signer_id: string;
  readonly signature_format: SignatureFormat | null;
  readonly signature_font: string | null;
  readonly verification_checks: ReadonlyArray<string>;
  readonly signing_ip: string | null;
}

/**
 * Sortable columns for the envelope list. `signers` orders by the
 * count of `envelope_signers` rows; `progress` by the completed /
 * total ratio (0 when an envelope has no signers). The rest map to
 * literal `envelopes` columns. Default is `date` (i.e. `updated_at`).
 */
export const ENVELOPE_SORT_KEYS = [
  'date',
  'created',
  'title',
  'status',
  'signers',
  'progress',
] as const;
export type EnvelopeSortKey = (typeof ENVELOPE_SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

/**
 * Keyset cursor. `sort_value` is the stringified value of the active
 * sort expression for the last row of the previous page; `updated_at`
 * + `id` are the always-unique tie-break so the 3-tuple is a total
 * order even when many rows share the same `sort_value`.
 */
export interface ListCursor {
  readonly sort_value: string;
  readonly updated_at: string;
  readonly id: string;
}

/**
 * Dashboard status "buckets" — distinct from the literal
 * `envelopes.status` column. `awaiting_you` / `awaiting_others` split
 * `awaiting_others`/`sealing` envelopes by whether the auth'd viewer
 * is still a pending signer; the rest map 1:1 to a column value
 * (`sealed` ↔ `completed`).
 */
export const ENVELOPE_BUCKETS = [
  'draft',
  'awaiting_you',
  'awaiting_others',
  'sealed',
  'declined',
] as const;
export type EnvelopeBucket = (typeof ENVELOPE_BUCKETS)[number];

/** A `[from, to)` instant window for the date filter. */
export interface DateWindow {
  readonly from: string; // ISO
  readonly to: string; // ISO, exclusive
}

export interface ListFilters {
  /** Case-insensitive substring on `title` + `short_code`. */
  readonly q?: string;
  /** Selected status buckets — OR-combined. Empty/absent = no bucket filter. */
  readonly buckets?: ReadonlyArray<EnvelopeBucket>;
  /** Half-open `[from, to)` window on `updated_at`. */
  readonly date?: DateWindow;
  /** Lower-cased signer emails — envelope matches if it has ANY of them. */
  readonly signerEmails?: ReadonlyArray<string>;
  /** Lower-cased tag names — envelope matches if it has ANY of them. */
  readonly tags?: ReadonlyArray<string>;
}

export interface ListOptions extends ListFilters {
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  readonly limit: number; // 1..100
  readonly sort?: EnvelopeSortKey; // default 'date'
  readonly dir?: SortDir; // default 'desc'
  readonly cursor?: ListCursor | null;
  /** Auth'd viewer's email — needed to resolve the awaiting-you bucket. */
  readonly viewerEmail?: string | null;
}

export interface EnvelopeListSignerSnippet {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly status: import('shared').SignerUiStatus;
  readonly signed_at: string | null;
}

export interface EnvelopeListItem {
  readonly id: string;
  readonly title: string;
  readonly short_code: string;
  readonly status: EnvelopeStatus;
  readonly original_pages: number | null;
  readonly sent_at: string | null;
  readonly completed_at: string | null;
  readonly expires_at: string;
  readonly tags: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly signers: ReadonlyArray<EnvelopeListSignerSnippet>;
}

export interface ListResult {
  readonly items: ReadonlyArray<EnvelopeListItem>;
  readonly next_cursor: string | null;
}

export interface EventInput {
  readonly envelope_id: string;
  readonly signer_id?: string | null;
  readonly actor_kind: 'sender' | 'signer' | 'system';
  readonly event_type:
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
  readonly ip?: string | null;
  readonly user_agent?: string | null;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Port for envelope persistence. The adapter owns row-conditional UPDATEs
 * for the narrow race guards the service layer needs (draft-only mutations,
 * awaiting_others→sealing/declined/expired transitions). Everything else —
 * owner checks on signer/field mutations, HTTP mapping, token generation,
 * email enqueue — is on the caller.
 */
export abstract class EnvelopesRepository {
  // Reads
  abstract createDraft(input: CreateDraftInput): Promise<Envelope>;
  abstract findByIdForOwner(owner_id: string, envelope_id: string): Promise<Envelope | null>;
  abstract findByIdWithAll(envelope_id: string): Promise<Envelope | null>;
  abstract findByShortCode(short_code: string): Promise<Envelope | null>;
  abstract findSignerByAccessTokenHash(
    hash: string,
  ): Promise<{ envelope: Envelope; signer: EnvelopeSigner } | null>;
  abstract listByOwner(owner_id: string, opts: ListOptions): Promise<ListResult>;
  abstract listEventsForEnvelope(envelope_id: string): Promise<ReadonlyArray<EnvelopeEvent>>;

  /**
   * Walk the audit-event hash chain for an envelope and return whether it
   * is intact. Recomputes `prev_event_hash` for each event from the
   * canonical JSON of the previous event and compares against the stored
   * value; any mismatch (or any non-genesis event with NULL prev_event_hash)
   * means the chain is broken — i.e. some row was inserted, modified, or
   * deleted out-of-band, bypassing `appendEvent`.
   *
   * Returns `chain_intact: true` for an empty event log (vacuously) or for
   * a single-event chain where the genesis prev hash is NULL.
   */
  abstract verifyEventChain(envelope_id: string): Promise<{ readonly chain_intact: boolean }>;

  /**
   * Returns the per-signer metadata needed by the audit PDF renderer
   * (signature format, verification checks, signing IP). Kept separate from
   * findByIdWithAll so the domain Signer shape — used by the public wire
   * contract — does not leak these fields. Order is unspecified; callers
   * should key by signer_id.
   */
  abstract listSignerAuditDetails(envelope_id: string): Promise<ReadonlyArray<SignerAuditDetail>>;

  // Draft composition
  abstract updateDraftMetadata(
    owner_id: string,
    envelope_id: string,
    patch: UpdateDraftMetadataPatch,
  ): Promise<Envelope | null>;
  abstract deleteDraft(owner_id: string, envelope_id: string): Promise<boolean>;
  abstract setOriginalFile(
    envelope_id: string,
    input: SetOriginalFileInput,
  ): Promise<Envelope | null>;

  abstract addSigner(envelope_id: string, input: AddSignerInput): Promise<EnvelopeSigner>;
  abstract removeSigner(envelope_id: string, signer_id: string): Promise<boolean>;
  abstract replaceFields(
    envelope_id: string,
    fields: ReadonlyArray<CreateFieldInput>,
  ): Promise<ReadonlyArray<EnvelopeField>>;

  // Send + lifecycle
  abstract sendDraft(input: SendDraftInput): Promise<Envelope | null>;

  /**
   * Rotate a signer's access_token_hash (reminder path). Guards at the SQL
   * level: only updates when the parent envelope is `awaiting_others` AND
   * the signer has neither signed nor declined yet. Returns false when any
   * of those preconditions are violated — the service maps to an
   * appropriate 4xx response.
   */
  abstract rotateSignerAccessToken(
    signer_id: string,
    new_access_token_hash: string,
  ): Promise<boolean>;
  abstract recordSignerViewed(
    signer_id: string,
    ip: string | null,
    user_agent: string | null,
  ): Promise<EnvelopeSigner>;
  abstract acceptTerms(signer_id: string): Promise<EnvelopeSigner>;
  abstract fillField(
    field_id: string,
    signer_id: string,
    value: SignerFieldFillInput,
  ): Promise<EnvelopeField | null>;
  abstract setSignerSignature(
    signer_id: string,
    input: SetSignerSignatureInput,
  ): Promise<EnvelopeSigner>;
  abstract submitSigner(
    signer_id: string,
    ip: string | null,
    user_agent: string | null,
  ): Promise<SubmitResult | null>;
  abstract declineSigner(
    signer_id: string,
    reason: string | null,
    ip: string | null,
    user_agent: string | null,
  ): Promise<Envelope | null>;

  /**
   * Sender-initiated cancel. Atomically flips an envelope from
   * `awaiting_others` or `sealing` → `canceled` and revokes any pending
   * signer access tokens (NULLs `access_token_hash` so a previously-sent
   * `/sign/start` request returns 401). Returns null when the row is
   * missing, owner mismatch, or status was not in the cancelable set —
   * the service re-reads to disambiguate 404 vs 409.
   *
   * Returned signer-id splits drive the email fan-out:
   *   - `notifiedSignerIds` — signers who hadn't signed yet → enqueue
   *      `withdrawn_to_signer` (link is dead, no action needed).
   *   - `alreadySignedSignerIds` — signers who completed before cancel
   *      → enqueue `withdrawn_after_sign` (their copy + audit retained).
   */
  abstract cancelEnvelope(
    envelope_id: string,
    owner_id: string,
  ): Promise<{
    readonly envelope: Envelope;
    readonly notifiedSignerIds: ReadonlyArray<string>;
    readonly alreadySignedSignerIds: ReadonlyArray<string>;
  } | null>;

  abstract expireEnvelopes(now: Date, limit: number): Promise<ReadonlyArray<string>>;

  // Audit
  abstract appendEvent(input: EventInput): Promise<EnvelopeEvent>;

  // Jobs
  abstract enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only'): Promise<string>;

  /**
   * Atomically claim the next pending job. Uses SELECT FOR UPDATE SKIP LOCKED
   * semantics in PG so multiple workers don't double-process a row. Returns
   * null when no pending work. `started_at` is set, `attempts` is incremented,
   * status flips `pending`|`failed` → `running`.
   */
  abstract claimNextJob(): Promise<ClaimedJob | null>;

  /** Mark a claimed job done. Idempotent — callers should always call on success. */
  abstract finishJob(job_id: string): Promise<void>;

  /**
   * Mark a claimed job failed. If attempts < max_attempts, flips back to
   * `pending` with a delayed `scheduled_for` (exponential backoff); otherwise
   * terminal `failed`. `last_error` is always recorded.
   */
  abstract failJob(job_id: string, error: string): Promise<void>;

  /**
   * Row-conditional transition envelope.status = 'sealing' → 'sealed'. Stamps
   * sealed_file_path, sealed_sha256, audit_file_path, completed_at. Returns
   * the updated envelope, or null if the row was not in sealing (e.g. raced).
   */
  abstract transitionToSealed(
    envelope_id: string,
    input: { sealed_file_path: string; sealed_sha256: string; audit_file_path: string },
  ): Promise<Envelope | null>;

  /**
   * For audit_only jobs (envelope already in a terminal status like
   * 'declined' or 'expired'). Sets audit_file_path without status change.
   */
  abstract setAuditFile(envelope_id: string, audit_file_path: string): Promise<Envelope | null>;

  /**
   * Returns the Storage paths stamped on the envelope row. Used by the
   * download endpoint to hand the client a signed URL. `null` on any
   * component means that artifact hasn't been produced yet.
   */
  abstract getFilePaths(envelope_id: string): Promise<{
    readonly original_file_path: string | null;
    readonly sealed_file_path: string | null;
    readonly audit_file_path: string | null;
  } | null>;

  /**
   * Issue #46 — for the `/me/export` payload we need to surface signer
   * artifact paths (drawn signature image and drawn initials image)
   * alongside the envelope so the user can download the original raster
   * captures, not just the burned-in PDF. The shape stays internal
   * (image paths are not in the public Signer wire contract) so callers
   * must explicitly opt-in by calling this method. Order is unspecified;
   * key by `signer_id`.
   */
  abstract listSignerImagePaths(envelope_id: string): Promise<
    ReadonlyArray<{
      readonly signer_id: string;
      readonly signature_image_path: string | null;
      readonly initials_image_path: string | null;
    }>
  >;

  // Cursor helper — decode the opaque 3-tuple cursor returned by
  // listByOwner. Throws InvalidCursorError on malformed input. Lives
  // on the port so the service layer doesn't need to know the cursor
  // encoding format.
  abstract decodeCursorOrThrow(cursor: string): ListCursor;

  /**
   * Issues #38 / #43 — atomic account-deletion purge for the
   * envelopes aggregate. Run inside a single repository call so the
   * adapter can wrap it in a transaction; partial failures must roll
   * back so the user can retry.
   *
   * Steps:
   *   1. Hard-delete every envelope where `owner_id = $1 AND status =
   *      'draft'`. Drafts have no statutory retention requirement.
   *   2. For every non-draft envelope (sealed, awaiting_others,
   *      sealing, declined, expired, canceled) owned by the user:
   *        a. Anonymize signer rows whose `email` (case-insensitive)
   *           matches `email` — replace name with "Deleted user" and
   *           email with `email_hash + "@deleted.invalid"` so the
   *           audit chain is preserved but the PII is gone.
   *        b. Append a `retention_deleted` event to the audit chain so
   *           verifiers can see when and why the owner was scrubbed.
   *           The event_type already exists in the enum (added by the
   *           original schema author for exactly this purpose).
   *        c. NULL the envelope's `owner_id` so the envelope survives
   *           the upcoming `auth.users` deletion. Migration 0012
   *           relaxed the column to nullable + flipped the FK to ON
   *           DELETE SET NULL as a belt-and-braces.
   *
   * Returns counts so the service can log + assert on them. Anonymized
   * signer rows are counted across all preserved envelopes.
   */
  abstract purgeOwnedDataForAccountDeletion(input: {
    readonly owner_id: string;
    readonly email: string | null;
    readonly email_hash: string;
  }): Promise<{
    readonly drafts_deleted: number;
    readonly envelopes_preserved: number;
    readonly signers_anonymized: number;
    readonly retention_events_appended: number;
  }>;
}

/**
 * Thrown when the (envelope_id, email) unique index on envelope_signers is
 * violated. Service maps to 409 `signer_email_taken`.
 */
export class EnvelopeSignerEmailTakenError extends Error {
  constructor() {
    super('envelope_signer_email_taken');
    this.name = 'EnvelopeSignerEmailTakenError';
  }
}

/**
 * Thrown when a lifecycle mutation targets an envelope already in a terminal
 * state where non-terminal was expected (e.g. decline on an already-declined
 * envelope). Service maps to 409 `envelope_terminal`.
 */
export class EnvelopeTerminalError extends Error {
  constructor(public readonly currentStatus: EnvelopeStatus) {
    super('envelope_terminal');
    this.name = 'EnvelopeTerminalError';
  }
}

/**
 * Thrown by `listByOwner` when the caller-supplied cursor cannot be decoded.
 * Service maps to 400 `invalid_cursor`.
 */
export class InvalidCursorError extends Error {
  constructor() {
    super('invalid_cursor');
    this.name = 'InvalidCursorError';
  }
}

/**
 * Thrown by `createDraft` when the 13-char short_code collides with an
 * existing envelope's unique constraint. The service layer retries with a
 * freshly generated short code a small number of times before surfacing.
 *
 * Collision space is ~10^23, so in practice this should never fire; it
 * exists so the unique-constraint race is modelled explicitly rather than
 * leaking as a generic `23505`.
 */
export class ShortCodeCollisionError extends Error {
  constructor() {
    super('short_code_collision');
    this.name = 'ShortCodeCollisionError';
  }
}
