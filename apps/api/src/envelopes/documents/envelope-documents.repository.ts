/**
 * WP-03 — persistence port for the documents of an envelope (migration
 * 0022). Kept apart from EnvelopesRepository so the 1700-line legacy
 * adapter only gains the one `document_id` edit in `replaceFields`.
 *
 * Document 1 (`ord = 1`) is mirrored to the legacy `envelopes.original_*`
 * / `sealed_*` columns by a database trigger. Adapters that move a
 * different document into slot 1 (remove, reorder) also rewrite those
 * envelope columns in the same transaction.
 */
export interface EnvelopeDocumentRecord {
  readonly id: string;
  readonly envelope_id: string;
  readonly ord: number;
  readonly title: string;
  readonly original_file_path: string | null;
  readonly original_sha256: string | null;
  readonly original_pages: number | null;
  readonly sealed_file_path: string | null;
  readonly sealed_sha256: string | null;
}

export interface InsertDocumentInput {
  /** Chosen by the caller so the storage path can embed it before the insert. */
  readonly id: string;
  readonly envelope_id: string;
  readonly title: string;
  readonly original_file_path: string;
  readonly original_sha256: string;
  readonly original_pages: number;
  /** Refuse the insert when the envelope already holds this many documents. */
  readonly max_documents: number;
}

/** Thrown by `insertDocument` when the envelope is full. */
export class TooManyDocumentsError extends Error {
  constructor() {
    super('too_many_documents');
    this.name = 'TooManyDocumentsError';
  }
}

/** Thrown when a draft-only mutation targets an envelope that is not a draft. */
export class DocumentEnvelopeNotDraftError extends Error {
  constructor() {
    super('envelope_not_draft');
    this.name = 'DocumentEnvelopeNotDraftError';
  }
}

export abstract class EnvelopeDocumentsRepository {
  /** Documents of the envelope in `ord` order. Empty when none exist. */
  abstract listByEnvelope(envelope_id: string): Promise<ReadonlyArray<EnvelopeDocumentRecord>>;

  /**
   * Append a document at `max(ord) + 1`. Draft envelopes only (throws
   * DocumentEnvelopeNotDraftError); throws TooManyDocumentsError at the cap.
   * The envelope row is locked for the count, so two concurrent uploads
   * cannot both take the last slot or the same `ord`.
   */
  abstract insertDocument(input: InsertDocumentInput): Promise<EnvelopeDocumentRecord>;

  /** Rename one document. Returns false when it is not on that envelope. */
  abstract setTitle(envelope_id: string, document_id: string, title: string): Promise<boolean>;

  /**
   * Delete a document of a draft (its fields go with it, by FK cascade) and
   * close the gap in `ord`. Returns the removed row, or null when it is not
   * on that envelope. Throws DocumentEnvelopeNotDraftError off-draft.
   */
  abstract removeDocument(
    envelope_id: string,
    document_id: string,
  ): Promise<EnvelopeDocumentRecord | null>;

  /**
   * Give the documents the order of `document_ids` (which the caller has
   * checked is a permutation of the envelope's documents). Draft only.
   */
  abstract reorder(
    envelope_id: string,
    document_ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<EnvelopeDocumentRecord>>;

  /** field id → document id, for every field of the envelope. */
  abstract listFieldDocumentIds(envelope_id: string): Promise<ReadonlyMap<string, string>>;

  /** Record a document's sealed artifact. Called by the sealing job. */
  abstract setSealed(
    document_id: string,
    sealed_file_path: string,
    sealed_sha256: string,
  ): Promise<void>;
}
