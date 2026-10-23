import type { InsertOutboundEmailInput } from '../email/outbound-emails.repository';
import type { BulkBatchRecord, BulkRowRecord } from './bulk.repository';

/** Most failed rows listed in the summary; the rest are in the app. */
export const SUMMARY_MAX_FAILED_ROWS = 10;

const FAILURE_LABELS: Readonly<Record<string, string>> = {
  template_not_found: 'The template no longer exists',
  template_changed: 'The template changed after the preview',
  template_no_example_pdf: 'The template has no document',
  attempts_exhausted: 'Gave up after repeated errors',
  send_failed: 'The envelope could not be sent',
};

export function failureLabel(code: string | null): string {
  return (code !== null ? FAILURE_LABELS[code] : undefined) ?? 'The envelope could not be sent';
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

export interface BulkSummaryCounts {
  readonly total: number;
  readonly sent: number;
  readonly failed: number;
  readonly canceled: number;
  readonly invalid: number;
}

export function countRows(rows: ReadonlyArray<BulkRowRecord>): BulkSummaryCounts {
  const c = { total: rows.length, sent: 0, failed: 0, canceled: 0, invalid: 0 };
  for (const r of rows) {
    if (r.status === 'sent') c.sent += 1;
    else if (r.status === 'failed') c.failed += 1;
    else if (r.status === 'canceled') c.canceled += 1;
    else if (r.status === 'invalid') c.invalid += 1;
  }
  return c;
}

function outcomeWord(batch: BulkBatchRecord, counts: BulkSummaryCounts): string {
  if (batch.status === 'canceled') return 'canceled';
  return counts.failed > 0 ? 'complete with errors' : 'complete';
}

/**
 * The sender's summary when a batch ends. One row per batch: the dedupe key
 * is `bulk_complete:<batch id>`, so queueing it twice (a crash between the
 * enqueue and the `notified_at` stamp) sends one mail. Failed rows are listed
 * by row number, name and address; the addresses sit in plain spans so Gmail's
 * auto-linker does not restyle them.
 */
export function bulkCompleteEmail(
  batch: BulkBatchRecord,
  rows: ReadonlyArray<BulkRowRecord>,
  publicUrl: string,
): InsertOutboundEmailInput {
  const counts = countRows(rows);
  const failed = rows.filter((r) => r.status === 'failed');
  const shown = failed.slice(0, SUMMARY_MAX_FAILED_ROWS);
  const more = failed.length - shown.length;

  const lines = shown.map((r) => {
    const first = r.recipients[0];
    return {
      row: r.row_index,
      who: first ? `${first.name} (${first.email})` : '',
      name: first?.name ?? '',
      email: first?.email ?? '',
      why: failureLabel(r.error_code),
    };
  });
  const failedRowsText =
    lines.length === 0
      ? ''
      : `\nFailed rows:\n${lines.map((l) => `  Row ${l.row}: ${l.who} - ${l.why}`).join('\n')}${
          more > 0 ? `\n  and ${more} more in the app` : ''
        }\n`;
  const failedRowsHtml =
    lines.length === 0
      ? ''
      : `<p style="margin-top: 14px; color: #1f2937; font-size: 14px"><b>Failed rows</b></p>` +
        `<ul style="margin: 4px 0 0 18px; padding: 0; color: #1f2937; font-size: 14px">${lines
          .map(
            (l) =>
              `<li>Row ${l.row}: ${escapeHtml(l.name)} (<span style="color: #1f2937; text-decoration: none">${escapeHtml(
                l.email,
              )}</span>) &mdash; ${escapeHtml(l.why)}</li>`,
          )
          .join('')}${more > 0 ? `<li>and ${more} more in the app</li>` : ''}</ul>`;

  const base = publicUrl.replace(/\/$/, '');
  const batchUrl =
    batch.template_id !== null
      ? `${base}/templates/${batch.template_id}/bulk-send/${batch.id}`
      : `${base}/documents`;

  return {
    kind: 'bulk_complete',
    to_email: batch.sender_email,
    to_name: batch.sender_name ?? '',
    dedupe_key: `bulk_complete:${batch.id}`,
    payload: {
      template_title: batch.template_title,
      outcome_word: outcomeWord(batch, counts),
      sent_count: counts.sent,
      failed_count: counts.failed,
      canceled_count: counts.canceled,
      skipped_count: counts.invalid,
      total_count: counts.total,
      failed_rows_html: failedRowsHtml,
      failed_rows_text: failedRowsText,
      batch_url: batchUrl,
      public_url: base,
    },
  };
}
