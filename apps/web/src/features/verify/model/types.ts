/**
 * Types mirroring the public `GET /verify/:short_code` response from
 * `apps/api/src/verify/verify.controller.ts`. Kept narrow + readonly so
 * downstream UI components can't accidentally mutate the cache.
 *
 * These are deliberately decoupled from the API entity types — the verify
 * surface is a public read-only projection and we never want to leak owner
 * IDs, raw IPs, or other internal fields here.
 */

export type VerifyEnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';

export type VerifySignerStatus = 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';

export type VerifyEventActorKind = 'sender' | 'signer' | 'system';

export type VerifyEventType =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'consented'
  | 'signed'
  | 'declined'
  | 'sealed'
  | 'expired'
  | 'canceled'
  | 'reminded';

export interface VerifyEnvelope {
  readonly id: string;
  readonly title: string;
  readonly short_code: string;
  readonly status: VerifyEnvelopeStatus;
  readonly original_pages: number | null;
  readonly original_sha256: string | null;
  readonly sealed_sha256: string | null;
  readonly tc_version: string;
  readonly privacy_version: string;
  readonly sent_at: string | null;
  readonly completed_at: string | null;
  readonly expires_at: string;
}

export interface VerifySigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: string;
  readonly status: VerifySignerStatus;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
}

export interface VerifyEvent {
  readonly id: string;
  readonly actor_kind: VerifyEventActorKind;
  readonly event_type: VerifyEventType;
  readonly signer_id: string | null;
  readonly created_at: string;
}

export interface VerifyResponse {
  readonly envelope: VerifyEnvelope;
  readonly signers: ReadonlyArray<VerifySigner>;
  readonly events: ReadonlyArray<VerifyEvent>;
  /** 5-minute pre-signed URL. Null until the envelope is sealed. */
  readonly sealed_url: string | null;
  /** 5-minute pre-signed URL. Null when no audit.pdf has been generated. */
  readonly audit_url: string | null;
}
