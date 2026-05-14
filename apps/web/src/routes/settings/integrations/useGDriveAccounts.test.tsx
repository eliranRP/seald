import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useGDriveAccounts,
  useConnectGDrive,
  useDisconnectGDrive,
  useReconnectGDrive,
} from './useGDriveAccounts';

// Mock the shared apiClient — every test owns its own response set.
vi.mock('../../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock window.open for the connect flow — popup-style OAuth.
const openSpy = vi.fn();
Object.defineProperty(window, 'open', { value: openSpy, writable: true });

import { apiClient } from '../../../lib/api/apiClient';
const mockedGet = apiClient.get as ReturnType<typeof vi.fn>;
const mockedDelete = apiClient.delete as ReturnType<typeof vi.fn>;

function wrapper({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useGDriveAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSpy.mockReset();
  });

  it('lists accounts via GET /integrations/gdrive/accounts', async () => {
    mockedGet.mockResolvedValueOnce({
      data: [
        {
          id: 'acc-1',
          email: 'eliran@example.com',
          connectedAt: '2026-05-03T10:00:00Z',
          lastUsedAt: '2026-05-03T11:00:00Z',
        },
      ],
      status: 200,
    });
    const { result } = renderHook(() => useGDriveAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGet).toHaveBeenCalledWith('/integrations/gdrive/accounts');
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]?.email).toBe('eliran@example.com');
  });

  it('treats a 404 (feature flag off) as an empty list', async () => {
    const err = Object.assign(new Error('not_found'), { status: 404 });
    mockedGet.mockRejectedValueOnce(err);
    const { result } = renderHook(() => useGDriveAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useConnectGDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSpy.mockReset();
  });

  it('fetches the consent URL then opens it in a popup window', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' },
      status: 200,
    });
    const { result } = renderHook(() => useConnectGDrive(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockedGet).toHaveBeenCalledWith('/integrations/gdrive/oauth/url');
    expect(openSpy).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
      'gdrive-oauth',
      expect.stringContaining('width='),
    );
  });
});

describe('useReconnectGDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSpy.mockReset();
  });

  it('opens the consent URL with prompt=consent forced', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x' },
      status: 200,
    });
    const { result } = renderHook(() => useReconnectGDrive(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockedGet).toHaveBeenCalledWith('/integrations/gdrive/oauth/url');
    expect(openSpy).toHaveBeenCalledTimes(1);
    const opened = String(openSpy.mock.calls[0]?.[0] ?? '');
    expect(opened).toMatch(/[?&]prompt=consent\b/);
    expect(opened).toMatch(/client_id=x/);
    expect(openSpy.mock.calls[0]?.[1]).toBe('gdrive-oauth');
  });

  it('overrides any pre-existing prompt param on the URL', async () => {
    mockedGet.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?prompt=none&client_id=x' },
      status: 200,
    });
    const { result } = renderHook(() => useReconnectGDrive(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    const opened = String(openSpy.mock.calls[0]?.[0] ?? '');
    expect(opened).toMatch(/[?&]prompt=consent\b/);
    expect(opened).not.toMatch(/[?&]prompt=none\b/);
  });
});

describe('useDisconnectGDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openSpy.mockReset();
  });

  it('deletes the account by id', async () => {
    mockedDelete.mockResolvedValueOnce({ status: 204 });
    const { result } = renderHook(() => useDisconnectGDrive(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('acc-1');
    });
    expect(mockedDelete).toHaveBeenCalledWith('/integrations/gdrive/accounts/acc-1');
  });
});
