import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock('../supabase/supabaseClient', () => ({
  supabase: { auth: { getSession: () => getSession(), refreshSession: () => refreshSession() } },
  setKeepSignedIn: vi.fn(),
}));

import { apiClient } from './apiClient';
import { getSystemState, resetSystemState } from '../system/systemStore';

function failure(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosError {
  const response = { data, status, statusText: 'x', headers, config };
  return new AxiosError(
    `Request failed with status code ${String(status)}`,
    'ERR_BAD_REQUEST',
    config,
    null,
    response as unknown as AxiosResponse,
  );
}

async function withAdapter(adapter: AxiosAdapter, run: () => Promise<unknown>): Promise<void> {
  const original = apiClient.defaults.adapter;
  apiClient.defaults.adapter = adapter;
  try {
    await run().catch(() => undefined);
  } finally {
    if (original === undefined) delete apiClient.defaults.adapter;
    else apiClient.defaults.adapter = original;
  }
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('nope') });
});

afterEach(() => {
  vi.clearAllMocks();
  resetSystemState();
});

describe('apiClient system reactions', () => {
  it('publishes a rate-limit notice using the Retry-After header', async () => {
    await withAdapter(
      (config) => Promise.reject(failure(config, 429, {}, { 'retry-after': '12' })),
      () => apiClient.get('/x'),
    );
    const [notice] = getSystemState().notices;
    expect(notice?.title).toBe('Too many requests · try in 12 s');
  });

  it('falls back to 30 s when the 429 carries no hint', async () => {
    await withAdapter(
      (config) => Promise.reject(failure(config, 429)),
      () => apiClient.get('/x'),
    );
    expect(getSystemState().notices[0]?.title).toContain('30 s');
  });

  it('opens the signed-out state when a 401 cannot be refreshed', async () => {
    await withAdapter(
      (config) => Promise.reject(failure(config, 401)),
      () => apiClient.get('/x'),
    );
    expect(getSystemState().sessionExpired).toBe(true);
  });

  it('replays the request once after a successful refresh', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    let calls = 0;
    const adapter: AxiosAdapter = (config) => {
      calls += 1;
      if (calls === 1) return Promise.reject(failure(config, 401));
      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
    let result: unknown;
    await withAdapter(adapter, async () => {
      result = await apiClient.get('/x');
    });
    expect(calls).toBe(2);
    expect((result as { data: unknown }).data).toEqual({ ok: true });
    expect(getSystemState().sessionExpired).toBe(false);
  });

  it('does not raise the dialog for a 401 on a request without a token', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await withAdapter(
      (config) => Promise.reject(failure(config, 401)),
      () => apiClient.get('/x'),
    );
    expect(getSystemState().sessionExpired).toBe(false);
  });

  it('switches to maintenance on a 503 carrying x-maintenance', async () => {
    await withAdapter(
      (config) =>
        Promise.reject(failure(config, 503, { eta_minutes: 20 }, { 'x-maintenance': '1' })),
      () => apiClient.get('/x'),
    );
    expect(getSystemState().maintenance).toEqual({ active: true, etaMinutes: 20 });
  });

  it('ignores a plain 503', async () => {
    await withAdapter(
      (config) => Promise.reject(failure(config, 503)),
      () => apiClient.get('/x'),
    );
    expect(getSystemState().maintenance.active).toBe(false);
  });
});
