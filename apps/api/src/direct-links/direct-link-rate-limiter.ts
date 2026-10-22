import { Injectable } from '@nestjs/common';

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the oldest hit leaves the window; 0 when allowed. */
  readonly retryAfterSeconds: number;
}

/** Per-IP and per-link windows for the public routes. */
export const DIRECT_LINK_LIMITS = {
  /** Claims from one address across every link. */
  ipClaim: { limit: 10, windowMs: 10 * 60_000 },
  /** Claims through one link, from anyone. */
  linkClaim: { limit: 60, windowMs: 10 * 60_000 },
  /** Page loads from one address (also covers token guessing). */
  ipView: { limit: 60, windowMs: 60_000 },
} as const;

const MAX_KEYS = 20_000;

/**
 * Sliding-window counter kept in memory. It is the first, cheap gate in
 * front of the database daily cap (the authoritative per-link limit, shared
 * by every API instance). It does not depend on the global Throttler, which
 * is off under test and keyed by route only.
 */
@Injectable()
export class DirectLinkRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Records one hit for `key` and says whether it fits in the window. */
  hit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitDecision {
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_KEYS) this.prune(now, windowMs);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  reset(): void {
    this.hits.clear();
  }

  private prune(now: number, windowMs: number): void {
    for (const [key, times] of this.hits) {
      const last = times[times.length - 1];
      if (last === undefined || last <= now - windowMs) this.hits.delete(key);
    }
  }
}
