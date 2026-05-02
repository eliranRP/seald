/**
 * Types mirroring the public `GET /verify/:short_code` response from
 * `apps/api/src/verify/verify.controller.ts`. Kept narrow + readonly so
 * downstream UI components can't accidentally mutate the cache.
 *
 * These are deliberately decoupled from the API entity types — the verify
 * surface is a public read-only projection and we never want to leak owner
 * IDs, raw IPs, or other internal fields here.
 */

// Canonical from packages/shared/src/envelope-contract.ts. Drift here
// would silently break filters (e.g. "X of Y signed" rendered as 0/Y
// when the API returns 'completed' but FE filters for 'signed').
export type VerifyEnvelopeStatus =
  | 'draft'
  | 'awaiting_others'
  | 'sealing'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';

// Canonical SIGNER_UI_STATUSES from envelope-contract.ts.
export type VerifySignerStatus = 'awaiting' | 'viewing' | 'completed' | 'declined';

export type VerifyEventActorKind = 'sender' | 'signer' | 'system';

// Re-export the canonical EnvelopeEvent type from `shared` so the FE
// can never drift from the API enum. The previous hand-maintained
// union was missing `esign_disclosure_acknowledged`,
// `intent_to_sign_confirmed`, and `consent_withdrawn`, which crashed
// `describeEvent()` with `Cannot read properties of undefined (reading
// 'toLowerCase')` when those events appeared on a real envelope.
import type { EventType } from 'shared';
export type VerifyEventType = EventType;

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
