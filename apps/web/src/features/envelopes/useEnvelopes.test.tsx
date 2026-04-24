import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '../../lib/api/apiClient';
// eslint-disable-next-line import/first
import { ENVELOPES_KEY, useEnvelopesQuery, useCreateEnvelopeMutation } from './useEnvelopes';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function wrap(qc: QueryClient) {
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

function freshClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('useEnvelopesQuery', () => {
  it('exposes a stable key tuple for consumers', () => {
    expect(ENVELOPES_KEY).toEqual(['envelopes']);
  });

  it('GETs /envelopes and returns the typed response', async () => {
    get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: '1',
            title: 'A',
            short_code: 'AAA',
            status: 'draft',
            original_pages: 1,
            sent_at: null,
            completed_at: null,
            expires_at: '',
            created_at: '',
            updated_at: '',
          },
        ],
        next_cursor: null,
      },
      status: 200,
    });

    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopesQuery(true), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(get).toHaveBeenCalled();
    const firstCallUrl = get.mock.calls[0]?.[0] as string;
    expect(firstCallUrl).toBe('/envelopes');
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('skips the fetch when `enabled: false`', () => {
    const qc = freshClient();
    renderHook(() => useEnvelopesQuery(false), { wrapper: wrap(qc) });
    expect(get).not.toHaveBeenCalled();
  });

  it('serializes `statuses` + `limit` + `cursor` into the query string', async () => {
    get.mockResolvedValueOnce({ data: { items: [], next_cursor: null }, status: 200 });
    const qc = freshClient();
    const { result } = renderHook(
      () =>
        useEnvelopesQuery(true, {
          statuses: ['draft', 'awaiting_others'],
          limit: 20,
          cursor: 'abc',
        }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toContain('status=draft%2Cawaiting_others');
    expect(url).toContain('limit=20');
    expect(url).toContain('cursor=abc');
  });
});

describe('useCreateEnvelopeMutation', () => {
  it('POSTs /envelopes with the title', async () => {
    post.mockResolvedValueOnce({
      data: {
        id: 'new-env',
        owner_id: 'u',
        title: 'Contract',
        short_code: 'SC',
        status: 'draft',
        original_pages: null,
        expires_at: '',
        tc_version: '',
        privacy_version: '',
        sent_at: null,
        completed_at: null,
        signers: [],
        fields: [],
        created_at: '',
        updated_at: '',
      },
      status: 201,
    });
    const qc = freshClient();
    const { result } = renderHook(() => useCreateEnvelopeMutation(), { wrapper: wrap(qc) });
    const saved = await result.current.mutateAsync({ title: 'Contract' });
    expect(post).toHaveBeenCalled();
    const [url, body] = post.mock.calls[0]!;
    expect(url).toBe('/envelopes');
    expect(body).toEqual({ title: 'Contract' });
    expect(saved.id).toBe('new-env');
  });
});
