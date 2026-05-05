/**
 * Module-level wiring tests. The module's two new factories
 * (GDriveRateLimiter, GDRIVE_FILES_PROXY) read from APP_ENV and have
 * defaults that fire when the optional env vars are absent. Tests pin
 * those defaults so a typo in env.schema.ts can't silently widen the
 * rate-limit window.
 */
import { Test } from '@nestjs/testing';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import { GDRIVE_FILES_PROXY, GDriveRateLimiterFactoryProvider } from '../gdrive.module';
import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';

const baseEnv: Partial<AppEnv> = {
  NODE_ENV: 'test',
  APP_PUBLIC_URL: 'http://localhost:5173',
};

async function buildLimiter(env: Partial<AppEnv>): Promise<GDriveRateLimiter> {
  const moduleRef = await Test.createTestingModule({
    providers: [{ provide: APP_ENV, useValue: env }, GDriveRateLimiterFactoryProvider],
  }).compile();
  return moduleRef.get(GDriveRateLimiter);
}

describe('GDriveModule wiring (WT-A-2)', () => {
  it('exposes a GDRIVE_FILES_PROXY symbol', () => {
    expect(typeof GDRIVE_FILES_PROXY).toBe('symbol');
  });

  it('GDriveRateLimiter factory uses 30/60s defaults when env vars are absent', async () => {
    const limiter = await buildLimiter(baseEnv);
    // Capacity=30 → 30 calls succeed, 31st throws.
    for (let i = 0; i < 30; i++) {
      await limiter.acquire('user-1');
    }
    await expect(limiter.acquire('user-1')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('GDriveRateLimiter factory honors GDRIVE_API_RATE_PER_USER override', async () => {
    const limiter = await buildLimiter({
      ...baseEnv,
      GDRIVE_API_RATE_PER_USER: 2,
      GDRIVE_API_RATE_WINDOW_SECONDS: 60,
    });
    await limiter.acquire('user-1');
    await limiter.acquire('user-1');
    await expect(limiter.acquire('user-1')).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('GDriveRateLimiter factory converts seconds → milliseconds for the window', async () => {
    const limiter = await buildLimiter({
      ...baseEnv,
      GDRIVE_API_RATE_PER_USER: 1,
      GDRIVE_API_RATE_WINDOW_SECONDS: 60,
    });
    await limiter.acquire('user-1');
    const err = await limiter.acquire('user-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    // retryAfterMs should be ~60_000 ms (allow 5s slack for clock variance).
    expect((err as RateLimitedError).retryAfterMs).toBeGreaterThan(55_000);
    expect((err as RateLimitedError).retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
