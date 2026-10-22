/**
 * Template direct links (WP-37, flag `directLinks`).
 *
 * A template owner turns on one public link per template. It is bound to
 * ONE of the template's signer slots (`TemplateLastSigner.id`). Whoever
 * opens `/d/:token` enters a name and an email; the server creates a new
 * envelope from the template with that person in the bound slot and emails
 * them a normal signing link (so the email is proven before anything is
 * signed). The token is 256 bits of randomness; only its SHA-256 is stored,
 * so the full URL is shown once, when the link is created or rotated.
 */

/** `dl_` + 43 base64url characters (256 bits). */
export const DIRECT_LINK_TOKEN_PATTERN = /^dl_[A-Za-z0-9_-]{43}$/;

export const DIRECT_LINK_DAILY_CAP_DEFAULT = 50;
export const DIRECT_LINK_DAILY_CAP_MAX = 1000;
export const DIRECT_LINK_SENDER_NAME_MAX = 120;

/** What the owner sees. Never contains the token or its hash. */
export interface DirectLink {
  readonly id: string;
  readonly template_id: string;
  /** `TemplateLastSigner.id` of the slot a visitor fills. */
  readonly signer_slot: string;
  readonly enabled: boolean;
  /** First characters of the token, to tell links apart after rotation. */
  readonly prefix: string;
  /** Most envelopes this link may create per rolling 24 hours. */
  readonly daily_cap: number;
  /** Name shown on the public page; null shows a generic label. */
  readonly sender_name: string | null;
  /** Envelopes created from this link in the last 24 hours. */
  readonly created_last_24h: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Returned once, by create and rotate. `path` is `/d/<token>`. */
export interface DirectLinkWithToken {
  readonly link: DirectLink;
  readonly token: string;
  readonly path: string;
}

export interface CreateDirectLinkInput {
  readonly signer_slot: string;
  readonly daily_cap?: number;
  readonly sender_name?: string | null;
}

export interface UpdateDirectLinkInput {
  readonly enabled?: boolean;
  readonly signer_slot?: string;
  readonly daily_cap?: number;
  readonly sender_name?: string | null;
}

/** The only facts the public page may show. */
export interface PublicDirectLink {
  readonly template_title: string;
  readonly sender_name: string;
}

export interface ClaimDirectLinkInput {
  readonly name: string;
  readonly email: string;
}

/** Same answer whether or not an envelope was created (no enumeration). */
export interface ClaimDirectLinkResult {
  readonly status: 'check_your_email';
}

export const PUBLIC_SENDER_FALLBACK = 'A Seald user';
