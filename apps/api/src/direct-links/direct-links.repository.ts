/**
 * Port for template direct links (WP-37, migration 0033). The pg adapter is
 * `DirectLinksPgRepository`; e2e specs use the in-memory one.
 */

export interface DirectLinkRecord {
  readonly id: string;
  readonly template_id: string;
  readonly owner_id: string;
  readonly prefix: string;
  readonly signer_slot: string;
  readonly enabled: boolean;
  readonly daily_cap: number;
  readonly sender_name: string | null;
  readonly sender_email: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface CreateDirectLinkRow {
  readonly template_id: string;
  readonly owner_id: string;
  readonly token_hash: string;
  readonly prefix: string;
  readonly signer_slot: string;
  readonly daily_cap: number;
  readonly sender_name: string | null;
  readonly sender_email: string | null;
}

export interface DirectLinkPatch {
  readonly enabled?: boolean;
  readonly signer_slot?: string;
  readonly daily_cap?: number;
  readonly sender_name?: string | null;
  readonly sender_email?: string | null;
}

export type ReserveClaimResult =
  | { readonly kind: 'reserved'; readonly claim_id: string }
  /** This address already used this link in the last 24 hours. */
  | { readonly kind: 'duplicate' }
  /** The link already created `daily_cap` envelopes in the last 24 hours. */
  | { readonly kind: 'cap_reached' };

/** A template already has a live link. */
export class DirectLinkExistsError extends Error {
  constructor() {
    super('direct_link_exists');
  }
}

export interface EnvelopeProvenance {
  readonly envelope_id: string;
  readonly template_id: string;
  readonly direct_link_id: string;
}

export abstract class DirectLinksRepository {
  /** The template's live (not rotated away) link, owner scoped. */
  abstract findLiveByTemplate(
    owner_id: string,
    template_id: string,
  ): Promise<DirectLinkRecord | null>;

  /** The live link whose token hashes to `token_hash`, enabled or not. */
  abstract findLiveByTokenHash(token_hash: string): Promise<DirectLinkRecord | null>;

  /** Throws {@link DirectLinkExistsError} when the template has a live link. */
  abstract create(input: CreateDirectLinkRow): Promise<DirectLinkRecord>;

  abstract update(
    owner_id: string,
    template_id: string,
    patch: DirectLinkPatch,
  ): Promise<DirectLinkRecord | null>;

  /**
   * Revoke the live link and insert a new one with the same settings and a
   * new token, in one transaction. The old token stops resolving at once.
   * Null when the template has no live link.
   */
  abstract rotate(
    owner_id: string,
    template_id: string,
    next: {
      readonly token_hash: string;
      readonly prefix: string;
      readonly sender_email: string | null;
    },
  ): Promise<DirectLinkRecord | null>;

  /** Revoke the live link for good. False when there was none. */
  abstract revoke(owner_id: string, template_id: string): Promise<boolean>;

  /** Claims recorded in the last 24 hours. */
  abstract countRecentClaims(link_id: string, now: Date): Promise<number>;

  /**
   * Record one visitor attempt under a per-link lock, so concurrent claims
   * cannot overshoot `daily_cap` and one address cannot be mailed twice a
   * day through the same link.
   */
  abstract reserveClaim(input: {
    readonly link_id: string;
    readonly email_hash: string;
    readonly daily_cap: number;
    readonly now: Date;
  }): Promise<ReserveClaimResult>;

  /** Drop a reservation whose envelope could not be created, so the visitor can retry. */
  abstract releaseClaim(claim_id: string): Promise<void>;

  /** Link the claim to its envelope and stamp the envelope's provenance. */
  abstract attachEnvelope(claim_id: string, provenance: EnvelopeProvenance): Promise<void>;
}
