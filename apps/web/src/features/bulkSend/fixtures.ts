import type { BulkBatch, BulkBatchRow, BulkSchema } from 'shared';

/** Fixtures for tests and stories. Addresses use the reserved example.com domain. */
export const TEMPLATE_ID = '00000000-0000-4000-8000-0000000000aa';
export const BATCH_ID = '00000000-0000-4000-8000-0000000000bb';

export function fakeSchema(overrides: Partial<BulkSchema> = {}): BulkSchema {
  return {
    template_id: TEMPLATE_ID,
    template_title: 'Lease agreement',
    slots: [
      {
        slot: 1,
        label: 'Landlord',
        name_column: 'recipient_1_name',
        email_column: 'recipient_1_email',
      },
      {
        slot: 2,
        label: 'Tenant',
        name_column: 'recipient_2_name',
        email_column: 'recipient_2_email',
      },
    ],
    optional_columns: ['title'],
    max_rows: 100,
    max_file_bytes: 512 * 1024,
    ...overrides,
  };
}

export function fakeRow(n: number, overrides: Partial<BulkBatchRow> = {}): BulkBatchRow {
  return {
    row: n,
    status: 'pending',
    recipients: [
      { name: `Landlord ${String(n)}`, email: `landlord${String(n)}@example.com` },
      { name: `Tenant ${String(n)}`, email: `tenant${String(n)}@example.com` },
    ],
    title: `Lease ${String(n)}`,
    errors: [],
    envelope_id: null,
    error_code: null,
    ...overrides,
  };
}

export function fakeBatch(overrides: Partial<BulkBatch> = {}): BulkBatch {
  const rows = overrides.rows ?? [fakeRow(1), fakeRow(2), fakeRow(3)];
  const count = (status: string): number => rows.filter((r) => r.status === status).length;
  return {
    id: BATCH_ID,
    template_id: TEMPLATE_ID,
    template_title: 'Lease agreement',
    status: 'preview',
    filename: 'tenants.csv',
    slots: fakeSchema().slots,
    column_errors: [],
    ignored_columns: [],
    counts: {
      total: rows.length,
      invalid: count('invalid'),
      pending: count('pending'),
      processing: count('processing'),
      sent: count('sent'),
      failed: count('failed'),
      canceled: count('canceled'),
    },
    confirmable: rows.some((r) => r.status === 'pending'),
    rows,
    created_at: '2026-10-22T12:00:00.000Z',
    confirmed_at: null,
    completed_at: null,
    canceled_at: null,
    ...overrides,
  };
}

/** A preview with one bad email, one duplicate address and one good row. */
export function fakePreviewWithProblems(): BulkBatch {
  return fakeBatch({
    rows: [
      fakeRow(1),
      fakeRow(2, {
        status: 'invalid',
        recipients: [
          { name: 'Ada', email: 'not-an-email' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
        errors: [
          {
            code: 'bad_email',
            column: 'recipient_1_email',
            message: '"not-an-email" is not a valid email address.',
          },
        ],
      }),
      fakeRow(3, {
        status: 'invalid',
        recipients: [
          { name: 'Cy', email: 'same@example.com' },
          { name: 'Di', email: 'same@example.com' },
        ],
        errors: [
          {
            code: 'duplicate_email',
            column: 'recipient_2_email',
            message: 'same@example.com is already used by recipient 1 in this row.',
          },
        ],
      }),
    ],
  });
}

export function fakeProcessing(): BulkBatch {
  return fakeBatch({
    status: 'processing',
    confirmable: false,
    confirmed_at: '2026-10-22T12:01:00.000Z',
    rows: [
      fakeRow(1, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e01' }),
      fakeRow(2, { status: 'processing' }),
      fakeRow(3),
    ],
  });
}

export function fakeFinishedWithFailure(): BulkBatch {
  return fakeBatch({
    status: 'completed',
    confirmable: false,
    confirmed_at: '2026-10-22T12:01:00.000Z',
    completed_at: '2026-10-22T12:03:00.000Z',
    rows: [
      fakeRow(1, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e01' }),
      fakeRow(2, { status: 'failed', error_code: 'send_failed' }),
      fakeRow(3, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e03' }),
    ],
  });
}
