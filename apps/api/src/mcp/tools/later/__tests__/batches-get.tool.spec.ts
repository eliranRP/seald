import { NotFoundException } from '@nestjs/common';
import type { BulkBatch } from 'shared';
import { BatchesGetOutputSchema } from 'shared';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import { BATCH_ID, OWNER, call, errorOf, laterWorld, ok, principal } from './later-harness';

const batch = (overrides: Partial<BulkBatch> = {}): BulkBatch => ({
  id: BATCH_ID,
  template_id: null,
  template_title: 'Lease',
  status: 'processing',
  filename: null,
  slots: [],
  column_errors: [],
  ignored_columns: [],
  counts: { total: 3, invalid: 0, pending: 1, processing: 0, sent: 1, failed: 1, canceled: 0 },
  confirmable: false,
  rows: [
    {
      row: 1,
      status: 'sent',
      recipients: [{ name: 'A', email: 'a@example.com' }],
      title: 'Lease 1',
      errors: [],
      envelope_id: '11111111-1111-4111-8111-111111111111',
      error_code: null,
    },
    {
      row: 2,
      status: 'failed',
      recipients: [{ name: 'B', email: 'b@example.com' }],
      title: null,
      errors: [],
      envelope_id: null,
      error_code: 'template_changed',
    },
    {
      row: 3,
      status: 'pending',
      recipients: [{ name: 'C', email: 'c@example.com' }],
      title: 'Lease 3',
      errors: [],
      envelope_id: null,
      error_code: null,
    },
  ],
  created_at: '2026-10-02T11:00:00.000Z',
  confirmed_at: '2026-10-02T11:30:00.000Z',
  completed_at: null,
  canceled_at: null,
  ...overrides,
});

describe('batches_get', () => {
  beforeEach(() => {
    setFlags();
  });
  afterEach(() => {
    resetFlags();
  });

  it('maps a batch to status and one entry per row, with the failure slug', async () => {
    const w = laterWorld();
    w.answers.set('agentBulk.get', batch());
    const out = ok(await call(w, 'batches_get', { batch_id: BATCH_ID }));
    expect(BatchesGetOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({
      batch_id: BATCH_ID,
      status: 'processing',
      rows: [
        { title: 'Lease 1', envelope_id: '11111111-1111-4111-8111-111111111111', status: 'sent' },
        { title: null, envelope_id: null, status: 'failed', slug: 'template_changed' },
        { title: 'Lease 3', envelope_id: null, status: 'pending' },
      ],
    });
    expect(w.calls[0]?.args).toEqual([OWNER, BATCH_ID]);
  });

  it('is read-only: an unknown batch is bulk_batch_not_found, and it needs envelopes:read', async () => {
    const w = laterWorld();
    w.answers.set('agentBulk.get', new NotFoundException('bulk_batch_not_found'));
    expect(errorOf(await call(w, 'batches_get', { batch_id: BATCH_ID })).slug).toBe(
      'bulk_batch_not_found',
    );
    expect(errorOf(await call(w, 'batches_get', { batch_id: BATCH_ID }, principal([]))).slug).toBe(
      'insufficient_scope',
    );
  });
});
