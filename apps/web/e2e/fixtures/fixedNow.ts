import type { Page } from '@playwright/test';

/**
 * Freezes `Date.now()` and `new Date()` in the page context so timeline
 * assertions stay deterministic (rule 5.7). Default `2026-04-25T10:00:00Z`
 * matches the seald-web-bdd-implementation skill default.
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
    }, iso);
  }
}
