import type { BulkBatchStatus, BulkRecipient, BulkRowError, BulkRowStatus } from 'shared';

/** Sender choices that apply to every envelope of a batch. */
export interface BulkOptions {
  /** Days from the moment each envelope is sent. Omitted keeps the default. */
  readonly expires_in_days?: number;
  /** Reminder cadence (needs `customReminders`). */
  readonly reminder?: {
    readonly first_after_days: number;
    readonly interval_days: number;
    readonly max: number;
  };
  /** One step per template signer, in slot order (needs `signingOrder`). */
  readonly signing_order?: 'sequential';
}

export interface BulkBatchRecord {
  readonly id: string;
  readonly owner_id: string;
  readonly template_id: string | null;
  readonly template_title: string;
  readonly sender_email: string;
  readonly sender_name: string | null;
  readonly status: BulkBatchStatus;
  readonly filename: string | null;
  readonly csv_sha256: string;
  readonly slot_count: number;
  readonly total_rows: number;
  readonly valid_rows: number;
  readonly options: BulkOptions;
  readonly column_errors: ReadonlyArray<BulkRowError>;
  readonly ignored_columns: ReadonlyArray<string>;
  readonly created_at: string;
  readonly confirmed_at: string | null;
  readonly completed_at: string | null;
  readonly canceled_at: string | null;
  readonly notified_at: string | null;
}

export interface BulkRowRecord {
  readonly id: string;
  readonly batch_id: string;
  readonly row_index: number;
  readonly status: BulkRowStatus;
  readonly recipients: ReadonlyArray<BulkRecipient>;
  readonly title: string | null;
  readonly errors: ReadonlyArray<BulkRowError>;
  readonly envelope_id: string | null;
  readonly attempts: number;
  readonly locked_at: string | null;
  readonly error_code: string | null;
  readonly sent_at: string | null;
}

export interface NewBulkBatch {
  readonly owner_id: string;
  readonly template_id: string;
  readonly template_title: string;
  readonly sender_email: string;
  readonly sender_name: string | null;
  readonly filename: string | null;
  readonly csv_sha256: string;
  readonly slot_count: number;
  readonly options: BulkOptions;
  readonly column_errors: ReadonlyArray<BulkRowError>;
  readonly ignored_columns: ReadonlyArray<string>;
}

export interface NewBulkRow {
  readonly row_index: number;
  readonly recipients: ReadonlyArray<BulkRecipient>;
  readonly title: string | null;
  readonly errors: ReadonlyArray<BulkRowError>;
}

/** How many rows the worker may claim per window, across every process. */
export interface ClaimThrottle {
  readonly windowStart: Date;
  readonly maxPerWindow: number;
}

/**
 * Port for `bulk_batches` and `bulk_batch_rows` (migration 0032).
 *
 * Owner scoping: every method the HTTP surface calls takes `owner_id`.
 * The worker methods (`claimNextRow` and the row markers) do not, because
 * the worker acts for the batch's owner and loads the batch itself.
 */
export abstract class BulkRepository {
  /** Insert the batch and all rows (invalid ones with `status = 'invalid'`). */
  abstract createPreview(
    batch: NewBulkBatch,
    rows: ReadonlyArray<NewBulkRow>,
  ): Promise<BulkBatchRecord>;

  abstract findBatchForOwner(owner_id: string, id: string): Promise<BulkBatchRecord | null>;
  abstract findBatch(id: string): Promise<BulkBatchRecord | null>;
  abstract listRows(batch_id: string): Promise<ReadonlyArray<BulkRowRecord>>;

  /**
   * `preview` to `processing`, atomically. Null when the batch is missing,
   * not the owner's, or no longer a preview.
   */
  abstract confirm(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null>;

  /**
   * Cancel a preview or processing batch: pending rows become `canceled`; a
   * row already being sent finishes. Null when missing, not the owner's, or
   * already completed or canceled.
   */
  abstract cancel(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null>;

  /**
   * Claim the next row of a processing batch with `for update skip locked`:
   * a pending row, or a `processing` row whose lock is older than
   * `staleBefore` (its worker died). Returns null when nothing is due or the
   * throttle window is full.
   */
  abstract claimNextRow(
    now: Date,
    staleBefore: Date,
    throttle: ClaimThrottle,
  ): Promise<BulkRowRecord | null>;

  abstract setRowEnvelope(row_id: string, envelope_id: string): Promise<void>;
  abstract markRowSent(row_id: string, now: Date): Promise<void>;
  abstract markRowFailed(row_id: string, error_code: string): Promise<void>;
  /** Put a claimed row back to `pending` for another attempt. */
  abstract releaseRow(row_id: string, error_code: string): Promise<void>;

  /**
   * Stamp `completed_at` (and `completed` status for a processing batch) once
   * no row is pending or processing. Returns true when this call finished it.
   */
  abstract finishIfDone(batch_id: string, now: Date): Promise<boolean>;

  /** Finished batches whose summary email is not queued yet. */
  abstract listFinishedWithoutSummary(limit: number): Promise<ReadonlyArray<BulkBatchRecord>>;
  abstract markNotified(batch_id: string, now: Date): Promise<void>;
}
