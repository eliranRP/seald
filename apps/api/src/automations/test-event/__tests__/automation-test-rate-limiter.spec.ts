import {
  AUTOMATION_TEST_PER_OWNER_PER_MINUTE,
  AUTOMATION_TEST_PER_RECIPE_PER_MINUTE,
} from 'shared';
import {
  AutomationTestRateLimitedError,
  AutomationTestRateLimiter,
} from '../automation-test-rate-limiter';

const T0 = 1_000_000;

describe('AutomationTestRateLimiter', () => {
  it('allows 5 per recipe per minute, then refuses with Retry-After until the window ends', () => {
    const l = new AutomationTestRateLimiter();
    for (let i = 0; i < AUTOMATION_TEST_PER_RECIPE_PER_MINUTE; i += 1) l.consume('o', 'a', T0);
    let err: unknown;
    try {
      l.consume('o', 'a', T0 + 15_000);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AutomationTestRateLimitedError);
    expect((err as AutomationTestRateLimitedError).retryAfterSeconds).toBe(45);
    expect((err as AutomationTestRateLimitedError).getStatus()).toBe(429);
    expect(() => l.consume('o', 'a', T0 + 60_000)).not.toThrow();
  });

  it('keeps recipes and owners apart', () => {
    const l = new AutomationTestRateLimiter();
    for (let i = 0; i < 5; i += 1) l.consume('o', 'a', T0);
    expect(() => l.consume('o', 'b', T0)).not.toThrow();
    expect(() => l.consume('p', 'a', T0)).not.toThrow();
  });

  it('caps one owner across recipes at 20 per minute', () => {
    const l = new AutomationTestRateLimiter();
    for (let i = 0; i < AUTOMATION_TEST_PER_OWNER_PER_MINUTE; i += 1) {
      l.consume('o', `r${Math.floor(i / 5)}`, T0);
    }
    expect(() => l.consume('o', 'fresh', T0)).toThrow(AutomationTestRateLimitedError);
    expect(() => l.consume('other-owner', 'fresh', T0)).not.toThrow();
  });

  it('a refused call does not extend the window', () => {
    const l = new AutomationTestRateLimiter();
    for (let i = 0; i < 5; i += 1) l.consume('o', 'a', T0);
    for (let i = 0; i < 10; i += 1) expect(() => l.consume('o', 'a', T0 + 1000)).toThrow();
    expect(() => l.consume('o', 'a', T0 + 60_000)).not.toThrow();
  });

  it('reset forgets every window', () => {
    const l = new AutomationTestRateLimiter();
    for (let i = 0; i < 5; i += 1) l.consume('o', 'a', T0);
    l.reset();
    expect(() => l.consume('o', 'a', T0)).not.toThrow();
  });
});
