import {
  EXPIRY_PRESET_DAYS,
  isFeatureEnabled,
  type BulkBatch,
  type BulkRowError,
  type BulkRowStatus,
} from 'shared';

/** Bulk send is on only with the `bulkSend` flag. Off hides every entry point. */
export function isBulkSendEnabled(): boolean {
  return isFeatureEnabled('bulkSend');
}

/** Expiry choices for the upload form; the empty value keeps the server default. */
export const EXPIRY_CHOICES: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: '', label: 'Template default (30 days)' },
  ...EXPIRY_PRESET_DAYS.map((d) => ({ value: String(d), label: `${String(d)} days` })),
];

/** Plain copy per API slug on the upload and confirm steps. */
const ERROR_COPY: Readonly<Record<string, string>> = {
  bulk_csv_required: 'Choose a CSV file first.',
  bulk_file_too_large: 'That file is too large. Keep it under 512 KB.',
  bulk_csv_not_utf8: 'Save the file as CSV UTF-8 and try again.',
  bulk_csv_malformed: 'The file has an unclosed quote or a stray quote. Fix it and try again.',
  bulk_csv_no_rows: 'The file has a header but no rows.',
  bulk_too_many_rows:
    'The file has too many rows. Split it into smaller files of 100 rows or fewer.',
  bulk_options_invalid: 'One of the options is not valid.',
  bulk_no_valid_rows: 'None of the rows are valid, so there is nothing to send.',
  bulk_preview_expired: 'This preview expired. Upload the file again.',
  bulk_template_changed: 'The template changed after you uploaded the file. Upload it again.',
  bulk_batch_canceled: 'This batch was canceled.',
  bulk_batch_completed: 'This batch has already finished.',
  bulk_batch_not_found: 'We could not find that batch.',
  template_not_found: 'We could not find that template.',
  template_has_no_example_pdf: 'This template has no saved document. Add one, then try again.',
  template_has_no_fields: 'This template has no fields yet.',
  template_has_too_many_signers: 'This template has more signers than bulk send supports.',
  template_signer_without_signature_field:
    'Every signer in the template needs a required signature or initials field.',
  sender_email_missing: 'Sign in with an email account to send in bulk.',
};

export function errorCopy(slug: string): string {
  return ERROR_COPY[slug] ?? 'Something went wrong. Try again.';
}

/** Why a row that was valid in the preview did not send. */
const FAILURE_COPY: Readonly<Record<string, string>> = {
  template_not_found: 'The template no longer exists',
  template_changed: 'The template changed after the preview',
  template_no_example_pdf: 'The template has no document',
  attempts_exhausted: 'Gave up after repeated errors',
  send_failed: 'Could not be sent',
  signer_email_taken: 'Two recipients share an address',
};

export function failureCopy(code: string | null): string {
  return (code !== null ? FAILURE_COPY[code] : undefined) ?? 'Could not be sent';
}

/** Short problem text for one validation error. */
export function rowErrorText(error: BulkRowError): string {
  return error.message;
}

export const ROW_STATUS_LABEL: Readonly<Record<BulkRowStatus, string>> = {
  invalid: 'Has problems',
  pending: 'Ready',
  processing: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  canceled: 'Canceled',
};

/** A row's tone for the badge; the label always carries the meaning too. */
export function rowTone(status: BulkRowStatus): 'indigo' | 'amber' | 'emerald' | 'red' | 'neutral' {
  switch (status) {
    case 'sent':
      return 'emerald';
    case 'failed':
    case 'invalid':
      return 'red';
    case 'processing':
      return 'indigo';
    case 'pending':
      return 'amber';
    case 'canceled':
      return 'neutral';
  }
}

/** Rows that are done one way or another. */
export function finishedCount(batch: BulkBatch): number {
  const c = batch.counts;
  return c.sent + c.failed + c.canceled;
}

/** Rows that went into the send: everything that was valid. */
export function plannedCount(batch: BulkBatch): number {
  return batch.counts.total - batch.counts.invalid;
}

export function isFinished(batch: BulkBatch): boolean {
  return batch.status === 'completed' || batch.status === 'canceled';
}
