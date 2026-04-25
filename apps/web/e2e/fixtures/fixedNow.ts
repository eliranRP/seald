import type { Page } from '@playwright/test';

/**
 * Freezes wall-clock time in the page context so timeline assertions and
 * token-expiry checks stay deterministic. We override:
 *
 *   - `Date.now()` and `new Date()` (no args) — the JS clock most app code
 *     reads through.
 *   - `performance.now()` — animations and React's scheduler often read it,
 *     and a free-running `performance.now()` causes `expect(...).toHaveText`
 *     timing assertions to flake.
 *
 * Default is `2026-04-25T10:00:00Z`, matching the seald-web-bdd-implementation
 * skill default. Run via `page.addInitScript(...)` so the override is in place
 * before any app code (including Vite's HMR client) runs.
 */
export const DEFAULT_FIXED_NOW = '2026-04-25T10:00:00Z';

export class FixedNowFixture {
  constructor(private readonly page: Page) {}

  async install(iso: string = DEFAULT_FIXED_NOW): Promise<void> {
    process.env.SEALD_FIXED_NOW = iso;
    await this.page.addInitScript((isoString) => {
      const fixed = new Date(isoString).getTime();
      const RealDate = Date;
      class FixedDate extends RealDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super(fixed);
          } else {
            // @ts-expect-error - forwarding rest args to Date
            super(...args);
          }
        }

        static override now(): number {
          return fixed;
        }
      }
      // @ts-expect-error - test-only global override
      window.Date = FixedDate;

      // Freeze performance.now() to a stable origin too so repeated reads
      // return the same value within a synchronous task. We use a
      // monotonic counter rather than a constant so RAF / setTimeout chains
      // still progress, but increments are predictable (1ms per call).
      let perfTick = 0;
      const realPerfNow = window.performance.now.bind(window.performance);
      window.performance.now = () => {
        perfTick += 1;
        // Keep advancing so timing-sensitive code doesn't divide by zero,
        // but stay independent of wall-clock skew.
        return perfTick;
      };
      // Expose the real one for tests that explicitly want it.
      (window as unknown as { __realPerfNow: () => number }).__realPerfNow = realPerfNow;
    }, iso);
  }
}
