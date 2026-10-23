import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { APPROVAL_POLICY } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

const WINDOW_MS = 60_000;
/** Keys kept before old windows are swept, so a flood cannot grow the map without bound. */
const SWEEP_AT = 10_000;

/**
 * Flood limit for the public approval page: preview and decision calls,
 * 10 per minute per IP and per token. An in-process fixed window per key,
 * the same single-node shape as `GDriveRateLimiter`; the global
 * `ThrottlerGuard` still applies on top. Off under `NODE_ENV=test`, like
 * the throttler, so e2e suites from one IP are not cut off; the limiter
 * itself is unit-tested.
 */
@Injectable()
export class ApprovalRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly enabled: boolean;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.enabled = env.NODE_ENV !== 'test';
  }

  /** Throws 429 `rate_limited` when any key is over its budget. */
  check(keys: ReadonlyArray<string | null>, now: number = Date.now()): void {
    if (!this.enabled) return;
    this.consume(keys, now);
  }

  /** Counting core, always on; exposed for the unit spec. Throws like {@link check}. */
  consume(keys: ReadonlyArray<string | null>, now: number = Date.now()): void {
    if (this.windows.size > SWEEP_AT) this.sweep(now);
    let retryAfter = 0;
    for (const key of keys) {
      if (key === null) continue;
      const w = this.windows.get(key);
      if (!w || now - w.start >= WINDOW_MS) {
        this.windows.set(key, { start: now, count: 1 });
        continue;
      }
      w.count += 1;
      if (w.count > APPROVAL_POLICY.floodPerMinute) {
        retryAfter = Math.max(retryAfter, Math.ceil((w.start + WINDOW_MS - now) / 1000));
      }
    }
    if (retryAfter > 0) {
      throw new HttpException(
        { message: 'rate_limited', retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows) if (now - w.start >= WINDOW_MS) this.windows.delete(key);
  }
}
