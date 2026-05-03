/**
 * Per-user token bucket for outbound Google Drive API calls. Each call
 * `acquire(userId)` consumes one token; the bucket refills to its full
 * capacity once the window elapses.
 *
 * Single-instance: pass no `store` and the limiter keeps its own in-process
 * Map. Multi-instance: pass a shared store (Postgres-backed Map facade in
 * production via advisory lock + `gdrive_rate_buckets` row) so two API
 * pods cannot mint additional capacity. The shared-store contract is just
 * `Map<string, { tokens, resetAt }>` — the Postgres adapter is plugged in
 * by `app.module.ts` when running multi-instance.
 *
 * Mandated by red-flag row 13 (no Drive API call without per-user rate
 * limiting) and Phase 1 Q9 (30 req / 60 s default).
 */

export interface RateLimiterStore {
  get(key: string): { tokens: number; resetAt: number } | undefined;
  set(key: string, value: { tokens: number; resetAt: number }): void;
}

export interface RateLimiterOptions {
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock?: () => number;
  readonly store?: RateLimiterStore;
}

export class RateLimitedError extends Error {
  readonly code = 'rate-limited' as const;
  constructor(public readonly retryAfterMs: number) {
    super('rate_limited');
    this.name = 'RateLimitedError';
  }
}

export class GDriveRateLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  private readonly store: RateLimiterStore;

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.windowMs = opts.windowMs;
    this.clock = opts.clock ?? Date.now;
    this.store = opts.store ?? new Map<string, { tokens: number; resetAt: number }>();
  }

  async acquire(key: string): Promise<void> {
    const now = this.clock();
    const entry = this.store.get(key);
    if (!entry || entry.resetAt <= now) {
      // Window expired (or first hit) — refill, then take one.
      if (this.capacity <= 0) {
        throw new RateLimitedError(this.windowMs);
      }
      this.store.set(key, { tokens: this.capacity - 1, resetAt: now + this.windowMs });
      return;
    }
    if (entry.tokens <= 0) {
      throw new RateLimitedError(entry.resetAt - now);
    }
    this.store.set(key, { tokens: entry.tokens - 1, resetAt: entry.resetAt });
  }
}
