import {
  IdempotencyRecordsRepository,
  type ClaimInput,
  type ClaimOutcome,
  type IdempotencyRecord,
} from '../idempotency-records.repository';

interface Stored extends IdempotencyRecord {
  readonly expires_at_ms: number;
}

/** Same claim rules as the pg adapter, over a map. `nowMs` is settable. */
export class InMemoryIdempotencyRecordsRepository extends IdempotencyRecordsRepository {
  readonly rows = new Map<string, Stored>();
  nowMs = Date.parse('2026-10-02T12:00:00.000Z');

  private id(user: string, key: string): string {
    return `${user}|${key}`;
  }

  async claim(input: ClaimInput): Promise<ClaimOutcome> {
    const id = this.id(input.user_id, input.idempotency_key);
    const existing = this.rows.get(id);
    const stale =
      existing !== undefined &&
      existing.completed_at === null &&
      existing.request_hash === input.request_hash &&
      Date.parse(existing.created_at) < this.nowMs - input.stale_claim_seconds * 1000;
    if (!existing || existing.expires_at_ms <= this.nowMs || stale) {
      this.rows.set(id, {
        request_hash: input.request_hash,
        path: input.path,
        completed_at: null,
        response_status: 0,
        response_body: {},
        created_at: new Date(this.nowMs).toISOString(),
        expires_at_ms: this.nowMs + input.ttl_seconds * 1000,
      });
      return { claimed: true };
    }
    return { claimed: false, existing };
  }

  async complete(user: string, key: string, status: number, body: unknown): Promise<void> {
    const id = this.id(user, key);
    const row = this.rows.get(id);
    if (!row || row.completed_at !== null) return;
    this.rows.set(id, {
      ...row,
      response_status: status,
      response_body: JSON.parse(JSON.stringify(body)),
      completed_at: new Date(this.nowMs).toISOString(),
    });
  }

  async release(user: string, key: string): Promise<void> {
    const id = this.id(user, key);
    if (this.rows.get(id)?.completed_at === null) this.rows.delete(id);
  }
}
