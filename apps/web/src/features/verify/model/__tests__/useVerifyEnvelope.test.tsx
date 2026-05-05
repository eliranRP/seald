import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/verifyApiClient', () => ({
  verifyApiClient: {
    get: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { verifyApiClient } from '@/lib/api/verifyApiClient';
// eslint-disable-next-line import/first
import { useVerifyEnvelope, VERIFY_KEY } from '../useVerifyEnvelope';
// eslint-disable-next-line import/first
import type { VerifyResponse } from '../types';

const get = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

const PAYLOAD: VerifyResponse = {
  envelope: {
    id: 'env-1',
    title: 'Doc',
    short_code: 'AbCdEfGhIjKlM',
    status: 'completed',
    original_pages: 1,
    original_sha256: null,
    sealed_sha256: null,
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-25T00:00:00Z',
    completed_at: '2026-04-25T00:01:00Z',
    expires_at: '2026-05-25T00:00:00Z',
  },
  signers: [],
  events: [],
  chain_intact: true,
  sealed_url: null,
  audit_url: null,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { Wrapper, qc };
}

beforeEach(() => {
  get.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('VERIFY_KEY', () => {
  it('returns a stable, namespaced key tuple per short code', () => {
    // Two calls with the same short code must produce equal-shaped tuples
    // so React Query can dedupe them in the cache.
    const a = VERIFY_KEY('AbCdEfGhIjKlM');
    const b = VERIFY_KEY('AbCdEfGhIjKlM');
    expect(a).toEqual(['verify', 'AbCdEfGhIjKlM']);
    expect(b).toEqual(a);
  });

  it('produces a different key per short code so caches do not collide', () => {
    expect(VERIFY_KEY('aaaa')).not.toEqual(VERIFY_KEY('bbbb'));
  });
});

describe('useVerifyEnvelope', () => {
  it('GETs /verify/:shortCode and returns the response data', async () => {
    get.mockResolvedValueOnce({ data: PAYLOAD });
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useVerifyEnvelope('AbCdEfGhIjKlM'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(PAYLOAD);
    expect(get).toHaveBeenCalledTimes(1);
    const [path, opts] = get.mock.calls[0]!;
    expect(path).toBe('/verify/AbCdEfGhIjKlM');
    // Hook forwards the AbortController signal so React Query can cancel
    // an in-flight request if the consumer unmounts mid-fetch.
    expect((opts as { signal?: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });

  it('percent-encodes shortCodes that contain URL-unsafe characters', async () => {
    // The verify route is `/verify/:short_code`. Although real codes are
    // 13 chars [A-Za-z0-9], the page reads the param verbatim from the
    // URL so we must defend against any rogue character before splicing
    // into the request path. encodeURIComponent is the contract.
    get.mockResolvedValueOnce({ data: PAYLOAD });
    const { Wrapper } = makeWrapper();
    renderHook(() => useVerifyEnvelope('a/b c?d'), { wrapper: Wrapper });

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0]![0]).toBe('/verify/a%2Fb%20c%3Fd');
  });

  it('does not fire a request when the short code is empty (enabled gate)', async () => {
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useVerifyEnvelope(''), { wrapper: Wrapper });

    // Pending = no fetch initiated. Wait a microtask to be sure.
    await Promise.resolve();
    expect(get).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('surfaces ApiError shape (status + message) without retrying', async () => {
    const err = Object.assign(new Error('envelope_not_found'), { status: 404 });
    get.mockRejectedValueOnce(err);
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useVerifyEnvelope('missing-code'), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { status?: number } | null)?.status).toBe(404);
    expect(result.current.error?.message).toBe('envelope_not_found');
    // retry: false — verify is read-only, retries can't fix a wrong code
    // and would just slow down the error UI.
    expect(get).toHaveBeenCalledTimes(1);
  });
});
