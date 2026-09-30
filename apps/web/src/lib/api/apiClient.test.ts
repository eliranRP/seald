import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse } from 'axios';

vi.mock('../supabase/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
  setKeepSignedIn: vi.fn(),
}));

import { apiClient } from './apiClient';

/**
 * Replace the underlying axios adapter so we can stub HTTP responses
 * without pulling in axios-mock-adapter (not installed in apps/web).
 */
function withAdapter(adapter: AxiosAdapter, run: () => Promise<unknown>): Promise<unknown> {
  const original = apiClient.defaults.adapter;
  apiClient.defaults.adapter = adapter;
  return run().finally(() => {
    if (original === undefined) {
      delete apiClient.defaults.adapter;
    } else {
      apiClient.defaults.adapter = original;
    }
  });
}

describe('apiClient response interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('surfaces the API-supplied message when the body has one', async () => {
    const adapter: AxiosAdapter = (config) => {
      const response = {
        data: { message: 'title required' },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
      };
      const err = new AxiosError(
        'Request failed with status code 400',
        'ERR_BAD_REQUEST',
        config,
        null,
        response as unknown as AxiosResponse,
      );
      return Promise.reject(err);
    };
    await expect(withAdapter(adapter, () => apiClient.post('/envelopes', {}))).rejects.toThrow(
      /title required/,
    );
  });

  it('joins array messages from class-validator into a single string', async () => {
    const adapter: AxiosAdapter = (config) => {
      const response = {
        data: { message: ['title must be a string', 'title should not be empty'] },
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: {},
        config,
      };
      const err = new AxiosError(
        'Request failed with status code 422',
        'ERR_BAD_REQUEST',
        config,
        null,
        response as unknown as AxiosResponse,
      );
      return Promise.reject(err);
    };
    await expect(withAdapter(adapter, () => apiClient.post('/envelopes', {}))).rejects.toThrow(
      /title must be a string, title should not be empty/,
    );
  });

  // Bug C regression (2026-05-03): users hitting Send while the API was
  // unreachable saw the raw axios message "Network Error" — there's no
  // body and no statusText, so the interceptor was returning the bare
  // err.message. The MWReview banner then read "Couldn't send: Network
  // Error" which doesn't tell the user what to do. Replace with an
  // actionable message that names the connection failure mode.
  it('returns a friendly connection-failure message on network error', async () => {
    const adapter: AxiosAdapter = () => {
      const err = new AxiosError('Network Error', 'ERR_NETWORK');
      return Promise.reject(err);
    };
    await expect(withAdapter(adapter, () => apiClient.post('/envelopes', {}))).rejects.toThrow(
      /couldn't reach the server/i,
    );
  });

  it('returns the same friendly message for a request timeout', async () => {
    const adapter: AxiosAdapter = () => {
      const err = new AxiosError('timeout of 0ms exceeded', 'ECONNABORTED');
      return Promise.reject(err);
    };
    await expect(withAdapter(adapter, () => apiClient.post('/envelopes', {}))).rejects.toThrow(
      /couldn't reach the server/i,
    );
  });

  // Every toast that reads err.message, and useSaveEnvelopeToGdrive's
  // /not[_-]sealed/ fallback, now see the filter's { error } slug
  // instead of the HTTP status text.
  it('surfaces a slug from an { error } body', async () => {
    const adapter: AxiosAdapter = (config) => {
      const response = {
        data: { error: 'key_limit' },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      };
      const err = new AxiosError(
        'Request failed with status code 409',
        'ERR_BAD_REQUEST',
        config,
        null,
        response as unknown as AxiosResponse,
      );
      return Promise.reject(err);
    };
    await expect(
      withAdapter(adapter, () => apiClient.post('/me/api-keys', {})),
    ).rejects.toMatchObject({
      message: 'key_limit',
      code: 'key_limit',
    });
  });

  it('turns an envelope_not_sealed slug into the message Drive save matches', async () => {
    const adapter: AxiosAdapter = (config) => {
      const response = {
        data: { error: 'envelope_not_sealed' },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      };
      const err = new AxiosError(
        'Request failed with status code 409',
        'ERR_BAD_REQUEST',
        config,
        null,
        response as unknown as AxiosResponse,
      );
      return Promise.reject(err);
    };
    await expect(
      withAdapter(adapter, () => apiClient.post('/envelopes/x/gdrive', {})),
    ).rejects.toMatchObject({
      message: 'envelope_not_sealed',
      code: 'envelope_not_sealed',
      status: 409,
    });
  });
});
