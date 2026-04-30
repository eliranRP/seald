import { IdempotencyRepository } from '../src/me/idempotency.repository';

/**
 * In-memory adapter for `idempotency_records.deleteByUser`. The full
 * idempotency middleware stores `Map<key, response>` and that's not what
 * the account-deletion path cares about — it only needs a count of
 * rows-wiped per user. We model that with a multiset of synthetic ids
 * keyed by user_id.
 */
export class InMemoryIdempotencyRepository extends IdempotencyRepository {
  /** user_id -> set of synthetic record ids. */
  private readonly rows = new Map<string, Set<string>>();

  reset(): void {
    this.rows.clear();
  }

  /** Test helper: pre-seed N rows for a user so deleteByUser has work to do. */
  seed(user_id: string, count: number): void {
    const set = this.rows.get(user_id) ?? new Set<string>();
    for (let i = 0; i < count; i++) set.add(`stub-${user_id}-${i}-${Math.random()}`);
    this.rows.set(user_id, set);
  }

  /** Test helper: count rows currently held for a user. */
  countFor(user_id: string): number {
    return this.rows.get(user_id)?.size ?? 0;
  }

  async deleteByUser(user_id: string): Promise<number> {
    const set = this.rows.get(user_id);
    if (!set) return 0;
    const n = set.size;
    this.rows.delete(user_id);
    return n;
  }
}
