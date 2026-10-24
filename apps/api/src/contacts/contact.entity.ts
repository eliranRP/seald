/**
 * Pure domain shape of a Contact as exposed by the repository and consumed
 * by the HTTP layer. Timestamps are ISO strings — adapters convert from the
 * DB-native `Date` at the boundary.
 */
export interface Contact {
  readonly id: string;
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * A contact plus what the Contacts page shows beside it: how many sent
 * envelopes list this email as a signer, and when the latest one went out.
 * Computed on read from `envelope_signers`; nothing is stored on the contact.
 */
export interface ContactWithStats extends Contact {
  readonly docs_count: number;
  readonly last_sent_at: string | null;
}
