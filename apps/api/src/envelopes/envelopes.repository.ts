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
}

export interface SignerFieldFillInput {
  readonly value_text?: string | null;
  readonly value_boolean?: boolean | null;
}

export interface SetSignerSignatureInput {
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

export interface ListOptions {
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  readonly limit: number; // 1..100
  readonly cursor?: { readonly updated_at: string; readonly id: string } | null;
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
  readonly created_at: string;
  readonly updated_at: string;
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
  abstract expireEnvelopes(now: Date, limit: number): Promise<ReadonlyArray<string>>;

  // Audit
  abstract appendEvent(input: EventInput): Promise<EnvelopeEvent>;

  // Jobs
  abstract enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only'): Promise<string>;

  // Cursor helper — decode the opaque cursor returned by listByOwner. Throws
  // InvalidCursorError on malformed input. Lives on the port so the service
  // layer doesn't need to know the cursor encoding format.
  abstract decodeCursorOrThrow(cursor: string): { updated_at: string; id: string };
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
