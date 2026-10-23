import { TemplateService } from '../../email/template.service';
import { bulkCompleteEmail, SUMMARY_MAX_FAILED_ROWS } from '../bulk-complete-email';
import type { BulkBatchRecord, BulkRowRecord } from '../bulk.repository';

const batch = (over: Partial<BulkBatchRecord> = {}): BulkBatchRecord => ({
  id: 'b1',
  owner_id: 'o1',
  template_id: 't1',
  template_title: 'Lease <b>agreement</b>',
  sender_email: 'sender@example.com',
  sender_name: 'Maya',
  status: 'completed',
  filename: 'x.csv',
  csv_sha256: 'a'.repeat(64),
  slot_count: 1,
  total_rows: 3,
  valid_rows: 3,
  options: {},
  column_errors: [],
  ignored_columns: [],
  created_at: '2026-10-22T12:00:00.000Z',
  confirmed_at: '2026-10-22T12:00:00.000Z',
  completed_at: '2026-10-22T12:05:00.000Z',
  canceled_at: null,
  notified_at: null,
  ...over,
});

const row = (n: number, over: Partial<BulkRowRecord> = {}): BulkRowRecord => ({
  id: `r${n}`,
  batch_id: 'b1',
  row_index: n,
  status: 'sent',
  recipients: [{ name: `Person ${n}`, email: `p${n}@example.com` }],
  title: null,
  errors: [],
  envelope_id: null,
  attempts: 1,
  locked_at: null,
  error_code: null,
  sent_at: null,
  ...over,
});

describe('bulkCompleteEmail', () => {
  const svc = new TemplateService();
  beforeAll(() => svc.onModuleInit());

  const vars = (payload: Readonly<Record<string, unknown>>) => ({
    legal_entity: 'Seald',
    legal_postal: 'Postal',
    privacy_url: 'https://seald.test/privacy',
    preferences_url: 'mailto:x@seald.test',
    ...Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, typeof v === 'number' ? v : String(v)]),
    ),
  });

  it('addresses the sender, dedupes per batch and counts every row status', () => {
    const email = bulkCompleteEmail(
      batch(),
      [
        row(1),
        row(2, { status: 'failed', error_code: 'template_not_found' }),
        row(3, { status: 'invalid' }),
        row(4, { status: 'canceled' }),
      ],
      'https://seald.test/',
    );
    expect(email).toMatchObject({
      kind: 'bulk_complete',
      to_email: 'sender@example.com',
      to_name: 'Maya',
      dedupe_key: 'bulk_complete:b1',
    });
    expect(email.payload).toMatchObject({
      sent_count: 1,
      failed_count: 1,
      canceled_count: 1,
      skipped_count: 1,
      total_count: 4,
      outcome_word: 'complete with errors',
      batch_url: 'https://seald.test/templates/t1/bulk-send/b1',
    });
  });

  it('renders the HTML and text bodies with no unresolved variables and escaped content', () => {
    const email = bulkCompleteEmail(
      batch(),
      [
        row(1),
        row(2, { status: 'failed', recipients: [{ name: '<img src=x>', email: 'a@example.com' }] }),
      ],
      'https://seald.test',
    );
    const out = svc.render('bulk_complete', vars(email.payload));
    expect(out.subject).toBe(
      'Bulk send "Lease <b>agreement</b>" is complete with errors: 1 sent, 1 failed',
    );
    for (const part of [out.html, out.text]) {
      expect(part).not.toMatch(/\{\{[^}]+\}\}/);
      expect(part).toContain('https://seald.test/templates/t1/bulk-send/b1');
    }
    expect(out.html).not.toContain('<b>agreement</b>');
    expect(out.html).toContain('Lease &lt;b&gt;agreement&lt;/b&gt;');
    expect(out.html).not.toContain('<img src=x>');
    expect(out.html).toContain('&lt;img src=x&gt;');
    expect(out.html.toLowerCase()).toContain('<!doctype html>');
    expect(out.html).toContain('>Seald</strong>');
    // Gmail's auto-linker: the address sits in a styled span.
    expect(out.html).toContain(
      '<span style="color: #1f2937; text-decoration: none">a@example.com</span>',
    );
    expect(out.text).toContain('Row 2: <img src=x> (a@example.com)');
  });

  it('lists at most ten failed rows and says how many more there are', () => {
    const rows = Array.from({ length: SUMMARY_MAX_FAILED_ROWS + 3 }, (_, i) =>
      row(i + 1, { status: 'failed' }),
    );
    const email = bulkCompleteEmail(batch(), rows, 'https://seald.test');
    expect(String(email.payload['failed_rows_text'])).toContain('and 3 more in the app');
    expect(String(email.payload['failed_rows_html']).match(/<li>Row/g)).toHaveLength(10);
  });

  it('says canceled for a canceled batch and complete when nothing failed', () => {
    expect(
      bulkCompleteEmail(batch({ status: 'canceled' }), [row(1)], 'https://s').payload,
    ).toMatchObject({
      outcome_word: 'canceled',
    });
    expect(bulkCompleteEmail(batch(), [row(1)], 'https://s').payload).toMatchObject({
      outcome_word: 'complete',
      failed_rows_html: '',
    });
  });

  it('falls back to the documents page when the template is gone', () => {
    const email = bulkCompleteEmail(batch({ template_id: null }), [row(1)], 'https://seald.test');
    expect(email.payload['batch_url']).toBe('https://seald.test/documents');
  });
});
