import { randomUUID } from 'node:crypto';
import {
  BulkRepository,
  type BulkBatchRecord,
  type BulkOptions,
  type BulkRowRecord,
  type ClaimThrottle,
  type NewBulkBatch,
  type NewBulkRow,
} from '../src/bulk/bulk.repository';

type MutableBatch = { -readonly [K in keyof BulkBatchRecord]: BulkBatchRecord[K] };
type MutableRow = { -readonly [K in keyof BulkRowRecord]: BulkRowRecord[K] };

/**
 * Hermetic in-memory bulk repository for service and e2e tests. It mirrors the
 * PG adapter's rules: only `processing` batches are claimable, a claim picks
 * pending rows or `processing` rows with a stale lock in (confirmed_at,
 * row_index) order, and the throttle counts claims in the window.
 */
export class InMemoryBulkRepository extends BulkRepository {
  readonly batches = new Map<string, MutableBatch>();
  readonly rows = new Map<string, MutableRow>();

  reset(): void {
    this.batches.clear();
    this.rows.clear();
  }

  async createPreview(
    batch: NewBulkBatch,
    rows: ReadonlyArray<NewBulkRow>,
  ): Promise<BulkBatchRecord> {
    const record: MutableBatch = {
      id: randomUUID(),
      owner_id: batch.owner_id,
      template_id: batch.template_id,
      template_title: batch.template_title,
      sender_email: batch.sender_email,
      sender_name: batch.sender_name,
      status: 'preview',
      filename: batch.filename,
      csv_sha256: batch.csv_sha256,
      slot_count: batch.slot_count,
      total_rows: rows.length,
      valid_rows: rows.filter((r) => r.errors.length === 0).length,
      options: batch.options,
      column_errors: batch.column_errors,
      ignored_columns: batch.ignored_columns,
      created_at: new Date().toISOString(),
      confirmed_at: null,
      completed_at: null,
      canceled_at: null,
      notified_at: null,
    };
    this.batches.set(record.id, record);
    for (const r of rows) {
      const row: MutableRow = {
        id: randomUUID(),
        batch_id: record.id,
        row_index: r.row_index,
        status: r.errors.length === 0 ? 'pending' : 'invalid',
        recipients: r.recipients,
        title: r.title,
        errors: r.errors,
        envelope_id: null,
        attempts: 0,
        locked_at: null,
        error_code: null,
        sent_at: null,
      };
      this.rows.set(row.id, row);
    }
    return { ...record };
  }

  async findBatchForOwner(owner_id: string, id: string): Promise<BulkBatchRecord | null> {
    const b = this.batches.get(id);
    return b && b.owner_id === owner_id ? { ...b } : null;
  }

  async findBatch(id: string): Promise<BulkBatchRecord | null> {
    const b = this.batches.get(id);
    return b ? { ...b } : null;
  }

  async listRows(batch_id: string): Promise<ReadonlyArray<BulkRowRecord>> {
    return [...this.rows.values()]
      .filter((r) => r.batch_id === batch_id)
      .sort((a, b) => a.row_index - b.row_index)
      .map((r) => ({ ...r }));
  }

  async mergePreviewOptions(
    owner_id: string,
    id: string,
    patch: Partial<BulkOptions>,
  ): Promise<BulkBatchRecord | null> {
    const b = this.batches.get(id);
    if (!b || b.owner_id !== owner_id || b.status !== 'preview') return null;
    b.options = { ...b.options, ...patch };
    return { ...b };
  }

  async confirm(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null> {
    const b = this.batches.get(id);
    if (!b || b.owner_id !== owner_id || b.status !== 'preview' || b.valid_rows === 0) return null;
    b.status = 'processing';
    b.confirmed_at = now.toISOString();
    return { ...b };
  }

  async cancel(owner_id: string, id: string, now: Date): Promise<BulkBatchRecord | null> {
    const b = this.batches.get(id);
    if (!b || b.owner_id !== owner_id) return null;
    if (b.status !== 'preview' && b.status !== 'processing') return null;
    const neverRan = b.status === 'preview';
    b.status = 'canceled';
    b.canceled_at = now.toISOString();
    if (neverRan) {
      b.completed_at = now.toISOString();
      b.notified_at = now.toISOString();
    }
    for (const r of this.rows.values()) {
      if (r.batch_id === id && r.status === 'pending') r.status = 'canceled';
    }
    return { ...b };
  }

  async claimNextRow(
    now: Date,
    staleBefore: Date,
    throttle: ClaimThrottle,
  ): Promise<BulkRowRecord | null> {
    const recent = [...this.rows.values()].filter(
      (r) => r.locked_at !== null && Date.parse(r.locked_at) > throttle.windowStart.getTime(),
    ).length;
    if (recent >= throttle.maxPerWindow) return null;
    const due = [...this.rows.values()]
      .filter((r) => {
        const b = this.batches.get(r.batch_id);
        if (!b || b.status !== 'processing') return false;
        if (r.status === 'pending') return true;
        return (
          r.status === 'processing' &&
          r.locked_at !== null &&
          Date.parse(r.locked_at) < staleBefore.getTime()
        );
      })
      .sort((a, b) => {
        const ba = Date.parse(this.batches.get(a.batch_id)?.confirmed_at ?? '');
        const bb = Date.parse(this.batches.get(b.batch_id)?.confirmed_at ?? '');
        return ba - bb || a.row_index - b.row_index;
      });
    const row = due[0];
    if (!row) return null;
    row.status = 'processing';
    row.locked_at = now.toISOString();
    row.attempts += 1;
    return { ...row };
  }

  async setRowEnvelope(row_id: string, envelope_id: string): Promise<void> {
    const r = this.rows.get(row_id);
    if (r) r.envelope_id = envelope_id;
  }

  async markRowSent(row_id: string, now: Date): Promise<void> {
    const r = this.rows.get(row_id);
    if (!r) return;
    r.status = 'sent';
    r.sent_at = now.toISOString();
    r.error_code = null;
  }

  async markRowFailed(row_id: string, error_code: string): Promise<void> {
    const r = this.rows.get(row_id);
    if (!r) return;
    r.status = 'failed';
    r.error_code = error_code;
  }

  async releaseRow(row_id: string, error_code: string): Promise<void> {
    const r = this.rows.get(row_id);
    if (r && r.status === 'processing') {
      r.status = 'pending';
      r.error_code = error_code;
    }
  }

  async finishIfDone(batch_id: string, now: Date): Promise<boolean> {
    const b = this.batches.get(batch_id);
    if (!b || b.completed_at !== null) return false;
    if (b.status !== 'processing' && b.status !== 'canceled') return false;
    const open = [...this.rows.values()].some(
      (r) => r.batch_id === batch_id && (r.status === 'pending' || r.status === 'processing'),
    );
    if (open) return false;
    if (b.status === 'processing') b.status = 'completed';
    b.completed_at = now.toISOString();
    return true;
  }

  async listFinishedWithoutSummary(limit: number): Promise<ReadonlyArray<BulkBatchRecord>> {
    return [...this.batches.values()]
      .filter(
        (b) =>
          b.notified_at === null &&
          b.completed_at !== null &&
          (b.status === 'completed' || b.status === 'canceled'),
      )
      .slice(0, limit)
      .map((b) => ({ ...b }));
  }

  async markNotified(batch_id: string, now: Date): Promise<void> {
    const b = this.batches.get(batch_id);
    if (b && b.notified_at === null) b.notified_at = now.toISOString();
  }
}
