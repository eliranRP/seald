import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

import { verifyApiClient } from '@/lib/api/verifyApiClient';
import type { VerifyResponse } from '@/features/verify';
import {
  SEALED_DOWNLOAD_FAST_POLL_MS,
  SEALED_DOWNLOAD_POST_SUBMIT_FAST_MS,
  SEALED_DOWNLOAD_SLOW_POLL_MS,
  sealedDownloadPollInterval,
  useSealedDownload,
} from '../useSealedDownload';

const get = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;

type Status = VerifyResponse['envelope']['status'];

function payload(status: Status, sealedUrl: string | null = null): VerifyResponse {
  return {
    envelope: {
      id: 'env-1',
      title: 'Doc',
      short_code: 'AbCdEfGhIjKlM',
      status,
      original_pages: 1,
      original_sha256: null,
      sealed_sha256: null,
      tc_version: '1',
      privacy_version: '1',
      sent_at: '2026-04-25T00:00:00Z',
      completed_at: null,
      expires_at: '2026-05-25T00:00:00Z',
    },
    signers: [],
    events: [],
    chain_intact: true,
    sealed_url: sealedUrl,
    audit_url: null,
  };
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSealedDownload polling', () => {
  it('polls slowly while other signers still have to sign (no 2 s poll forever)', async () => {
    get.mockResolvedValue({ data: payload('awaiting_others') });
    renderHook(() => useSealedDownload('AbCdEfGhIjKlM'), { wrapper: wrapper() });
    await advance(0);
    expect(get).toHaveBeenCalledTimes(1);
    // 20 s at a 2 s cadence would be ~10 more fetches; the slow poll makes none.
    await advance(20_000);
    expect(get).toHaveBeenCalledTimes(1);
    await advance(SEALED_DOWNLOAD_SLOW_POLL_MS - 20_000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('polls fast right after the signer submits, then falls back to slow', async () => {
    get.mockResolvedValue({ data: payload('awaiting_others') });
    renderHook(() => useSealedDownload('AbCdEfGhIjKlM', { justSubmitted: true }), {
      wrapper: wrapper(),
    });
    await advance(0);
    await advance(SEALED_DOWNLOAD_FAST_POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(4);
    await advance(SEALED_DOWNLOAD_POST_SUBMIT_FAST_MS);
    const afterWindow = get.mock.calls.length;
    await advance(SEALED_DOWNLOAD_SLOW_POLL_MS - 1_000);
    expect(get.mock.calls.length).toBeLessThanOrEqual(afterWindow + 1);
  });

  it('polls fast while sealing and stops once the sealed URL is known', async () => {
    get
      .mockResolvedValueOnce({ data: payload('sealing') })
      .mockResolvedValue({ data: payload('completed', 'https://signed.example/s.pdf') });
    const { result } = renderHook(() => useSealedDownload('AbCdEfGhIjKlM'), {
      wrapper: wrapper(),
    });
    await advance(0);
    await advance(SEALED_DOWNLOAD_FAST_POLL_MS);
    await advance(500);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.data?.sealed_url).toBe('https://signed.example/s.pdf');
    await advance(SEALED_DOWNLOAD_SLOW_POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('stops for a stopped envelope', async () => {
    get.mockResolvedValue({ data: payload('declined') });
    renderHook(() => useSealedDownload('AbCdEfGhIjKlM'), { wrapper: wrapper() });
    await advance(0);
    await advance(SEALED_DOWNLOAD_SLOW_POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('stops after an error (one quiet retry, then nothing)', async () => {
    get.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSealedDownload('AbCdEfGhIjKlM'), {
      wrapper: wrapper(),
    });
    await advance(0);
    await advance(5_000); // the single retry backs off ~1 s
    expect(result.current.isError).toBe(true);
    const calls = get.mock.calls.length;
    await advance(SEALED_DOWNLOAD_SLOW_POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(calls);
  });
});

describe('sealedDownloadPollInterval', () => {
  const base = { queryFailed: false, fastUntil: 0, now: 1_000 };
  it.each<[string, VerifyResponse | undefined, number | false]>([
    ['no data yet', undefined, SEALED_DOWNLOAD_FAST_POLL_MS],
    ['sealing', payload('sealing'), SEALED_DOWNLOAD_FAST_POLL_MS],
    ['awaiting_others', payload('awaiting_others'), SEALED_DOWNLOAD_SLOW_POLL_MS],
    ['completed without a URL yet', payload('completed'), SEALED_DOWNLOAD_SLOW_POLL_MS],
    ['completed with the URL', payload('completed', 'https://x/s.pdf'), false],
    ['expired', payload('expired'), false],
    ['canceled', payload('canceled'), false],
  ])('%s', (_label, data, expected) => {
    expect(sealedDownloadPollInterval({ ...base, data })).toBe(expected);
  });

  it('keeps awaiting_others fast inside the post-submit window', () => {
    expect(
      sealedDownloadPollInterval({ ...base, data: payload('awaiting_others'), fastUntil: 2_000 }),
    ).toBe(SEALED_DOWNLOAD_FAST_POLL_MS);
  });

  it('stops on error whatever the data', () => {
    expect(
      sealedDownloadPollInterval({ ...base, queryFailed: true, data: payload('sealing') }),
    ).toBe(false);
  });
});
