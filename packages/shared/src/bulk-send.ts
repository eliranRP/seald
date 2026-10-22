/**
 * Bulk send from a template (parity plan WP-36, flag `bulkSend`): wire
 * types and limits shared by the API and the SPA.
 *
 * A sender uploads a CSV with `recipient_<N>_name` / `recipient_<N>_email`
 * columns, one row per envelope; N is the template's signer slot in order
 * (1-based). An optional `title` column names each envelope. Any other
 * column is ignored and reported.
 */

/** Most data rows in one upload (the plan's app cap; MCP is capped at 20 separately). */
export const BULK_SEND_MAX_ROWS = 100;
/** Largest CSV accepted, in bytes. 100 rows of 20 recipients still fit. */
export const BULK_SEND_MAX_FILE_BYTES = 512 * 1024;
/** Most recipient slots a bulk-sendable template may have. */
export const BULK_SEND_MAX_SLOTS = 20;
/** Longest accepted recipient name, in characters. */
export const BULK_SEND_NAME_MAX = 200;
/** Longest accepted email address (RFC 5321). */
export const BULK_SEND_EMAIL_MAX = 254;
/** Longest accepted per-row title. */
export const BULK_SEND_TITLE_MAX = 200;
/** A preview that is not confirmed within this many hours expires. */
export const BULK_SEND_PREVIEW_TTL_HOURS = 24;

export const BULK_BATCH_STATUSES = ['preview', 'processing', 'completed', 'canceled'] as const;
export type BulkBatchStatus = (typeof BULK_BATCH_STATUSES)[number];

export const BULK_ROW_STATUSES = [
  'invalid',
  'pending',
  'processing',
  'sent',
  'failed',
  'canceled',
] as const;
export type BulkRowStatus = (typeof BULK_ROW_STATUSES)[number];

/** Machine-readable validation problems. The SPA maps each to copy. */
export const BULK_ROW_ERROR_CODES = [
  'missing_column',
  'missing_name',
  'missing_email',
  'bad_email',
  'duplicate_email',
  'name_too_long',
  'email_too_long',
  'title_too_long',
] as const;
export type BulkRowErrorCode = (typeof BULK_ROW_ERROR_CODES)[number];

export interface BulkRowError {
  readonly code: BulkRowErrorCode;
  /** The CSV column the problem is in, when there is one. */
  readonly column: string | null;
  /** Plain-English detail for the table. */
  readonly message: string;
}

export interface BulkRecipient {
  readonly name: string;
  readonly email: string;
}

/** One signer slot of the template, in order. */
export interface BulkSlot {
  /** 1-based; the N in `recipient_N_name`. */
  readonly slot: number;
  /** The template's signer label when it has one, else `Signer N`. */
  readonly label: string;
  readonly name_column: string;
  readonly email_column: string;
}

export interface BulkSchema {
  readonly template_id: string;
  readonly template_title: string;
  readonly slots: ReadonlyArray<BulkSlot>;
  readonly optional_columns: ReadonlyArray<string>;
  readonly max_rows: number;
  readonly max_file_bytes: number;
}

export interface BulkBatchRow {
  /** 1-based data row (the header is not counted). */
  readonly row: number;
  readonly status: BulkRowStatus;
  readonly recipients: ReadonlyArray<BulkRecipient>;
  readonly title: string | null;
  readonly errors: ReadonlyArray<BulkRowError>;
  readonly envelope_id: string | null;
  /** Slug of why a send failed, when `status` is `failed`. */
  readonly error_code: string | null;
}

export interface BulkBatchCounts {
  readonly total: number;
  readonly invalid: number;
  readonly pending: number;
  readonly processing: number;
  readonly sent: number;
  readonly failed: number;
  readonly canceled: number;
}

export interface BulkBatch {
  readonly id: string;
  readonly template_id: string | null;
  readonly template_title: string;
  readonly status: BulkBatchStatus;
  readonly filename: string | null;
  readonly slots: ReadonlyArray<BulkSlot>;
  /** Header problems (a missing required column) that make rows invalid. */
  readonly column_errors: ReadonlyArray<BulkRowError>;
  /** Columns in the file that the template does not use. */
  readonly ignored_columns: ReadonlyArray<string>;
  readonly counts: BulkBatchCounts;
  /** True while the sender can confirm: a preview with at least one valid row. */
  readonly confirmable: boolean;
  readonly rows: ReadonlyArray<BulkBatchRow>;
  readonly created_at: string;
  readonly confirmed_at: string | null;
  readonly completed_at: string | null;
  readonly canceled_at: string | null;
}

/** `recipient_<slot>_name` / `recipient_<slot>_email`. */
export function bulkColumnNames(slot: number): { name: string; email: string } {
  return { name: `recipient_${slot}_name`, email: `recipient_${slot}_email` };
}

/** Header line and one example row for a template with `slotCount` slots. */
export function bulkCsvTemplate(slotCount: number): string {
  const header: string[] = [];
  const example: string[] = [];
  for (let slot = 1; slot <= slotCount; slot += 1) {
    const { name, email } = bulkColumnNames(slot);
    header.push(name, email);
    example.push(`Signer ${slot} Name`, `signer${slot}@example.com`);
  }
  header.push('title');
  example.push('Optional envelope title');
  return `${header.join(',')}\n${example.join(',')}\n`;
}
