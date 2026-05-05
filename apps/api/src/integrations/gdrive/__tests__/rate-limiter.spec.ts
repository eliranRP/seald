import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';

describe('GDriveRateLimiter', () => {
  let now = 0;
  const clock = (): number => now;
  const advance = (ms: number): void => {
    now += ms;
  };

  beforeEach(() => {
    now = 1_700_000_000_000;
  });

  it('allows up to `capacity` hits inside the window', async () => {
    const limiter = new GDriveRateLimiter({ capacity: 30, windowMs: 60_000, clock });
    for (let i = 0; i < 30; i++) {
      await expect(limiter.acquire('user-A')).resolves.toBeUndefined();
    }
  });

  it('throws RateLimitedError on the 31st hit inside the window', async () => {
    const limiter = new GDriveRateLimiter({ capacity: 30, windowMs: 60_000, clock });
    for (let i = 0; i < 30; i++) await limiter.acquire('user-A');
    await expect(limiter.acquire('user-A')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('refills the bucket after the window elapses', async () => {
    const limiter = new GDriveRateLimiter({ capacity: 2, windowMs: 1000, clock });
    await limiter.acquire('user-A');
    await limiter.acquire('user-A');
    await expect(limiter.acquire('user-A')).rejects.toBeInstanceOf(RateLimitedError);
    advance(1001);
    await expect(limiter.acquire('user-A')).resolves.toBeUndefined();
  });

  it('isolates buckets per user key', async () => {
    const limiter = new GDriveRateLimiter({ capacity: 1, windowMs: 60_000, clock });
    await limiter.acquire('user-A');
    await expect(limiter.acquire('user-B')).resolves.toBeUndefined();
    await expect(limiter.acquire('user-A')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('multi-instance: two limiter instances sharing the same store cooperate', async () => {
    // Simulates the Postgres advisory-lock-backed shared store: both
    // limiter instances read/write the same counter so a second API
    // pod cannot mint additional capacity.
    const sharedStore = new Map<string, { tokens: number; resetAt: number }>();
    const a = new GDriveRateLimiter({ capacity: 3, windowMs: 60_000, clock, store: sharedStore });
    const b = new GDriveRateLimiter({ capacity: 3, windowMs: 60_000, clock, store: sharedStore });
    await a.acquire('user-A');
    await b.acquire('user-A');
    await a.acquire('user-A');
    await expect(b.acquire('user-A')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('error message carries the `rate-limited` code', async () => {
    const limiter = new GDriveRateLimiter({ capacity: 0, windowMs: 1000, clock });
    await limiter.acquire('user-A').catch((err: unknown) => {
      expect(err).toBeInstanceOf(RateLimitedError);
      expect((err as RateLimitedError).code).toBe('rate-limited');
    });
  });
});
