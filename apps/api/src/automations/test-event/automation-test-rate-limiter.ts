import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  AUTOMATION_TEST_PER_OWNER_PER_MINUTE,
  AUTOMATION_TEST_PER_RECIPE_PER_MINUTE,
} from 'shared';

const WINDOW_MS = 60_000;
/** Keys kept before stale windows are swept, so the map cannot grow without bound. */
const SWEEP_AT = 10_000;

/** 429 `rate_limited`; the controller copies `retryAfterSeconds` into `Retry-After`. */
export class AutomationTestRateLimitedError extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super({ message: 'rate_limited', retryAfter: retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * A2b test sends: 5 per recipe and 20 per owner per minute (fixed window,
 * in process, the same single-node shape as `ApprovalRateLimiter`). Each
 * test is one outbound POST of up to 10 s, so this bounds how hard an
 * owner can drive Seald at a third-party URL. On in every environment,
 * tests included: the budget is per recipe, so suites stay under it.
 * A refused call does not count against the budget.
 */
@Injectable()
export class AutomationTestRateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  consume(ownerId: string, automationId: string, now: number = Date.now()): void {
    if (this.windows.size > SWEEP_AT) this.sweep(now);
    const budgets: ReadonlyArray<readonly [string, number]> = [
      [`recipe:${ownerId}:${automationId}`, AUTOMATION_TEST_PER_RECIPE_PER_MINUTE],
      [`owner:${ownerId}`, AUTOMATION_TEST_PER_OWNER_PER_MINUTE],
    ];
    let retryAfter = 0;
    for (const [key, limit] of budgets) {
      const w = this.windows.get(key);
      if (w && now - w.start < WINDOW_MS && w.count >= limit) {
        retryAfter = Math.max(retryAfter, Math.ceil((w.start + WINDOW_MS - now) / 1000));
      }
    }
    if (retryAfter > 0) throw new AutomationTestRateLimitedError(Math.max(1, retryAfter));
    for (const [key] of budgets) {
      const w = this.windows.get(key);
      if (!w || now - w.start >= WINDOW_MS) this.windows.set(key, { start: now, count: 1 });
      else w.count += 1;
    }
  }

  /** Test seam: forget every window. */
  reset(): void {
    this.windows.clear();
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows) if (now - w.start >= WINDOW_MS) this.windows.delete(key);
  }
}
