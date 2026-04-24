import { vi } from 'vitest';
import type { AxiosResponse } from 'axios';

/**
 * Factory for mocking `signApiClient` at module scope in signing route tests.
 *
 * Usage:
 *   vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());
 *
 * Then import { __signApiMock } and override specific methods per-test:
 *   __signApiMock.post.mockResolvedValueOnce({ ... });
 *
 * The factory is intentionally untyped inside the returned object so each
 * test can set whatever axios-shaped response (including headers + status)
 * it needs without wrestling the generics.
 */
export function createSigningApiMock() {
  function ok<T>(data: T, status = 200): AxiosResponse<T> {
    return {
      data,
      status,
      statusText: 'OK',
      headers: {},
      config: {} as AxiosResponse<T>['config'],
    };
  }

  const get = vi.fn(async (_url: string) => ok({}));
  const post = vi.fn(async (_url: string, _body?: unknown) => ok({}));
  const patch = vi.fn(async (_url: string, _body?: unknown) => ok({}));
  const del = vi.fn(async (_url: string) => ok({}, 204));

  return {
    signApiClient: {
      defaults: { baseURL: 'http://test' },
      get,
      post,
      patch,
      delete: del,
      interceptors: {
        request: { use: () => 0 },
        response: { use: () => 0 },
      },
    },
  };
}

/**
 * Canonical SignMeResponse-shaped fixture. Test files tweak fields as needed.
 */
export const MOCK_ENVELOPE_ID = 'env-test-001';
export const MOCK_SIGNER_ID = 'signer-test-001';

export function makeSignMeResponse(overrides: Record<string, unknown> = {}) {
  return {
    envelope: {
      id: MOCK_ENVELOPE_ID,
      title: 'Master Services Agreement',
      short_code: 'DOC-ABCD-1234',
      status: 'awaiting_others',
      original_pages: 2,
      expires_at: '2030-01-01T00:00:00.000Z',
      tc_version: '2026-04-24',
      privacy_version: '2026-04-24',
    },
    signer: {
      id: MOCK_SIGNER_ID,
      email: 'maya@example.com',
      name: 'Maya Raskin',
      color: '#10B981',
      role: 'signatory',
      status: 'viewing',
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    },
    fields: [
      {
        id: 'f-text',
        signer_id: MOCK_SIGNER_ID,
        kind: 'text',
        page: 1,
        x: 60,
        y: 300,
        required: true,
        value_text: null,
        filled_at: null,
      },
      {
        id: 'f-sig',
        signer_id: MOCK_SIGNER_ID,
        kind: 'signature',
        page: 2,
        x: 60,
        y: 560,
        required: true,
        value_text: null,
        filled_at: null,
      },
    ],
    other_signers: [],
    ...overrides,
  };
}
