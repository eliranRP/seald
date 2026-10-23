/** One `mcp_uploads` row (migration 0029). Dates are ISO strings. */
export interface StagedUploadRecord {
  readonly id: string;
  readonly owner_id: string;
  readonly storage_key: string;
  readonly filename: string | null;
  readonly mime: string | null;
  readonly sha256: string | null;
  readonly byte_length: number | null;
  readonly page_count: number | null;
  readonly thumbnail_url: string | null;
  readonly source: 'upload' | 'gdrive';
  readonly drive_file_id: string | null;
  readonly drive_file_name: string | null;
  readonly conversion_job_id: string | null;
  readonly expires_at: string;
  readonly completed_at: string | null;
  readonly consumed_at: string | null;
  readonly created_at: string;
}

export interface InsertStagedUpload {
  readonly id: string;
  readonly owner_id: string;
  readonly storage_key: string;
  readonly filename: string | null;
  readonly source: 'upload' | 'gdrive';
  readonly drive_file_id?: string | null;
  readonly drive_file_name?: string | null;
  readonly expires_at: string;
}

export interface CompleteStagedUpload {
  readonly id: string;
  readonly owner_id: string;
  readonly mime: string;
  readonly sha256: string;
  readonly byte_length: number;
  readonly page_count: number;
  /** Completed uploads per owner per UTC day. */
  readonly daily_cap: number;
}

export type CompleteOutcome = 'completed' | 'not_pending' | 'daily_cap';

/**
 * Persistence port for staged uploads (docs/design/mcp-server.md §
 * `documents_upload`). Every query is scoped to the owner.
 */
export abstract class StagedUploadsRepository {
  abstract insert(input: InsertStagedUpload): Promise<StagedUploadRecord>;

  abstract find(owner_id: string, id: string): Promise<StagedUploadRecord | null>;

  abstract findByJob(owner_id: string, job_id: string): Promise<StagedUploadRecord | null>;

  abstract setConversionJob(owner_id: string, id: string, job_id: string): Promise<void>;

  /**
   * The doc's conditional complete, under a per-owner
   * `pg_advisory_xact_lock` that also counts today's completed uploads:
   * `daily_cap` when the owner is at the cap, `not_pending` when the row
   * is gone or already complete.
   */
  abstract complete(input: CompleteStagedUpload): Promise<CompleteOutcome>;

  /** Completed uploads of the owner since `since` (the preview's cap check). */
  abstract countCompletedSince(owner_id: string, since: string): Promise<number>;

  /**
   * The doc's attach claim: set `consumed_at` on a completed, not yet attached,
   * unexpired row. Null when it does not qualify.
   */
  abstract consume(owner_id: string, id: string): Promise<StagedUploadRecord | null>;

  /** Undo `consume` after the attach itself failed. */
  abstract releaseClaim(owner_id: string, id: string): Promise<void>;

  abstract delete(owner_id: string, id: string): Promise<void>;

  /** Expired rows never attached (`consumed_at` null), oldest first. */
  abstract listExpiredUnattached(
    now: string,
    limit: number,
  ): Promise<ReadonlyArray<StagedUploadRecord>>;

  abstract deleteMany(ids: ReadonlyArray<string>): Promise<number>;

  /** Every staging object key of the owner (account deletion). */
  abstract listStorageKeys(owner_id: string): Promise<ReadonlyArray<string>>;

  /** Record the Drive source on an envelope document (envelopes_search). */
  abstract setDocumentDriveSource(
    envelope_id: string,
    document_id: string,
    drive_file_name: string,
  ): Promise<void>;
}
