import type { EnvelopeStatus } from 'shared';

/**
 * Read-only queries the MCP read tools need and the dashboard list does
 * not have (docs/design/mcp-server.md, Read (M1)): signer-name search, a
 * template filter, and the pending-signer list. Kept out of the legacy
 * EnvelopesRepository (a hot file) per the parity plan's hot-file rule.
 *
 * Every query is scoped by `owner_id` first. Substring needles are bound
 * as parameters with `%` and `_` escaped; nothing is inlined.
 */

/** `(updated_at, id)` keyset. `updated_at` keeps microseconds as text. */
export interface UpdatedAtCursor {
  readonly updated_at: string;
  readonly id: string;
}

/** Pending-signer keyset: envelope `(updated_at, id)`, then signer id. */
export interface PendingCursor extends UpdatedAtCursor {
  readonly signer_id: string;
}

export interface SearchFilters {
  /** Lower-cased substring of title or short code. */
  readonly title?: string;
  /** Lower-cased substring of signer name or email. */
  readonly signer?: string;
  readonly statuses?: ReadonlyArray<EnvelopeStatus>;
  /** Lower-cased tags; an envelope matches when it has any of them. */
  readonly tags?: ReadonlyArray<string>;
  /** Inclusive, ISO. */
  readonly date_from?: string;
  /** Exclusive, ISO. */
  readonly date_to?: string;
  readonly template_id?: string;
  /** Lower-cased substring of a document's Drive source name (migration 0029). */
  readonly drive_file_name?: string;
  readonly limit: number;
  readonly cursor: UpdatedAtCursor | null;
}

export interface SearchSignerRow {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly viewed_at: string | null;
  readonly signed_at: string | null;
  readonly declined_at: string | null;
  /** When the current signing link went out; null until the first invite. */
  readonly access_token_sent_at: string | null;
}

export interface SearchDocumentRow {
  readonly id: string;
  readonly ord: number;
  readonly title: string;
  readonly original_pages: number | null;
}

export interface SearchEnvelopeRow {
  readonly id: string;
  readonly title: string;
  readonly status: EnvelopeStatus;
  readonly short_code: string;
  readonly sent_at: string | null;
  /** ISO, millisecond precision, for the wire. */
  readonly updated_at: string;
  /** Exact `updated_at` (microseconds) for the keyset. */
  readonly cursor_updated_at: string;
  readonly signers: ReadonlyArray<SearchSignerRow>;
  readonly documents: ReadonlyArray<SearchDocumentRow>;
}

export interface SearchPage {
  readonly rows: ReadonlyArray<SearchEnvelopeRow>;
  /** True when at least one more row matches after `rows`. */
  readonly has_more: boolean;
}

export interface PendingSignerRow {
  readonly envelope_id: string;
  readonly title: string;
  readonly envelope_status: EnvelopeStatus;
  readonly signer_id: string;
  readonly name: string;
  readonly email: string;
  readonly sent_at: string | null;
  readonly viewed_at: string | null;
  readonly cursor_updated_at: string;
}

export interface PendingPage {
  readonly rows: ReadonlyArray<PendingSignerRow>;
  readonly has_more: boolean;
}

export abstract class EnvelopeQueriesRepository {
  /**
   * Envelopes of the owner matching every set filter, newest
   * `updated_at` first, with their signers and documents.
   */
  abstract search(owner_id: string, filters: SearchFilters): Promise<SearchPage>;

  /**
   * Signers who have neither signed nor declined, on the owner's
   * `awaiting_others` envelopes. Ordered by envelope `updated_at desc`,
   * envelope id, then signer id.
   */
  abstract listPendingSigners(
    owner_id: string,
    opts: { readonly limit: number; readonly cursor: PendingCursor | null },
  ): Promise<PendingPage>;
}
