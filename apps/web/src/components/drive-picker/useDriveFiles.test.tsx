import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/api/apiClient';
// eslint-disable-next-line import/first
import { driveFilesKey, useDriveFiles, useReconnectAccount } from './useDriveFiles';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(qc: QueryClient) {
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  get.mockReset();
});

describe('driveFilesKey', () => {
  it('produces a stable tuple keyed by account + filter', () => {
    const a = driveFilesKey(ACCOUNT_ID, 'pdf');
    const b = driveFilesKey(ACCOUNT_ID, 'pdf');
    expect(a).toEqual(b);
    expect(driveFilesKey(ACCOUNT_ID, 'doc')).not.toEqual(a);
  });
});

describe('useDriveFiles', () => {
  it('hits /integrations/gdrive/files with accountId + mimeFilter and returns the typed payload', async () => {
    get.mockResolvedValueOnce({
      data: {
        files: [
          {
            id: 'f-pdf',
            name: 'Acme MSA - signed.pdf',
            mimeType: 'application/pdf',
          },
        ],
      },
      status: 200,
    });
    const qc = freshClient();
    const { result } = renderHook(
      () => useDriveFiles({ accountId: ACCOUNT_ID, mimeFilter: 'pdf', enabled: true }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledTimes(1);
    const [url, config] = get.mock.calls[0]!;
    expect(url).toBe('/integrations/gdrive/files');
    expect(config?.params).toEqual({ accountId: ACCOUNT_ID, mimeFilter: 'pdf' });
    expect(result.current.data?.files).toHaveLength(1);
    expect(result.current.tokenExpired).toBe(false);
  });

  it('sets tokenExpired=true when the API returns 401 and never retries it', async () => {
    const expired = Object.assign(new Error('reconnect_required'), { status: 401 });
    get.mockRejectedValue(expired);
    const qc = freshClient();
    const { result } = renderHook(
      () => useDriveFiles({ accountId: ACCOUNT_ID, mimeFilter: 'all', enabled: true }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.tokenExpired).toBe(true));
    // 401 should never be retried — the only way to recover is for the
    // user to click Reconnect, which is its own user-driven flow.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when enabled=false (closed picker)', () => {
    const qc = freshClient();
    renderHook(() => useDriveFiles({ accountId: ACCOUNT_ID, mimeFilter: 'all', enabled: false }), {
      wrapper: wrap(qc),
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('strips MIME types outside the allow-list as defence in depth', async () => {
    get.mockResolvedValueOnce({
      data: {
        files: [
          { id: 'good', name: 'a.pdf', mimeType: 'application/pdf' },
          { id: 'bad', name: 'a.exe', mimeType: 'application/x-msdownload' },
        ],
      },
      status: 200,
    });
    const qc = freshClient();
    const { result } = renderHook(
      () => useDriveFiles({ accountId: ACCOUNT_ID, mimeFilter: 'all', enabled: true }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.files.map((f) => f.id)).toEqual(['good']);
  });
});

describe('useReconnectAccount', () => {
  it('coalesces concurrent calls into a single in-flight Promise (single-flight)', async () => {
    const fn = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
    const { result } = renderHook(() => useReconnectAccount(fn));
    void result.current.reconnect();
    void result.current.reconnect();
    void result.current.reconnect();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows a fresh reconnect once the previous Promise has resolved', async () => {
    let resolveFirst: (() => void) | undefined;
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = () => resolve();
        }),
    );
    const { result } = renderHook(() => useReconnectAccount(fn));
    const first = result.current.reconnect();
    expect(fn).toHaveBeenCalledTimes(1);
    resolveFirst?.();
    await first;
    void result.current.reconnect();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
