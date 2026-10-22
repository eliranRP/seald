import { describe, expect, it } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { AxiosError, AxiosHeaders } from 'axios';
import { signApiClient } from './signApiClient';
import type { ApiError } from './signApiClient';

function failWith(status: number, data: unknown, headers: Record<string, string> = {}) {
  const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) =>
    Promise.reject(
      new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
        status,
        statusText: 'Err',
        data,
        headers: new AxiosHeaders(headers),
        config,
      }),
    );
  return signApiClient.get('/x', { adapter });
}

describe('signApiClient error wrapper', () => {
  it('exposes the API { error } slug as code and a positive Retry-After as retryAfterSeconds', async () => {
    const err = (await failWith(
      429,
      { error: 'access_code_cooldown' },
      { 'retry-after': '42' },
    ).catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(429);
    expect(err.code).toBe('access_code_cooldown');
    expect(err.retryAfterSeconds).toBe(42);
  });

  it('leaves both unset when the response has neither', async () => {
    const err = (await failWith(500, 'oops').catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBeUndefined();
    expect(err.retryAfterSeconds).toBeUndefined();
  });
});
