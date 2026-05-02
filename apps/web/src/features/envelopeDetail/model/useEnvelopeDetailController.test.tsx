import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as ReactRouterDom from 'react-router-dom';
import type { Envelope, EnvelopeSigner } from '@/features/envelopes';

// Mock the network at the apiClient layer — the same approach the existing
// `useEnvelopes.test.tsx` uses, so reminders + delete + downloads share a
// single seam.
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

// react-router's navigate spy — we assert that withdraw routes back to
// /documents on success.
const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/api/apiClient';
// eslint-disable-next-line import/first
import { useEnvelopeDetailController } from './useEnvelopeDetailController';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

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
    return (
      <MemoryRouter>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </MemoryRouter>
    );
  }
  return Wrapper;
}

function signer(overrides: Partial<EnvelopeSigner> = {}): EnvelopeSigner {
  return {
    id: 's1',
    email: 'a@b.com',
    name: 'A',
    color: '#000',
    role: 'signatory',
    signing_order: 1,
    status: 'awaiting',
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...overrides,
  };
}

function env(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-1',
    owner_id: 'u',
    title: 'NDA',
    short_code: 'NDA-1',
    status: 'awaiting_others',
    original_pages: 2,
    expires_at: '2030-01-01T00:00:00Z',
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-01T00:00:00Z',
    completed_at: null,
    signers: [signer()],
    fields: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

interface WindowOpenStub {
  readonly close: ReturnType<typeof vi.fn>;
  readonly closed: boolean;
  opener: unknown;
  location: { href: string };
}
function stubWindowOpen(): WindowOpenStub {
  const w: WindowOpenStub = {
    close: vi.fn(),
    closed: false,
    opener: { something: true },
    location: { href: 'about:blank' },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(window, 'open').mockReturnValue(w as any);
  return w;
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  navigate.mockReset();
});

describe('useEnvelopeDetailController — withdraw', () => {
  it('opens and closes the withdraw dialog from external triggers', () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });
    expect(result.current.withdrawOpen).toBe(false);
    act(() => result.current.openWithdraw());
    expect(result.current.withdrawOpen).toBe(true);
    act(() => result.current.closeWithdraw());
    expect(result.current.withdrawOpen).toBe(false);
  });

  it('confirmWithdraw fires DELETE /envelopes/:id and navigates back to /documents on success', async () => {
    del.mockResolvedValue({ status: 204, data: null });
    const qc = freshClient();
    const e = env();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: e }), {
      wrapper: wrap(qc),
    });

    act(() => result.current.openWithdraw());
    act(() => result.current.handleConfirmWithdraw());

    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('/envelopes/env-1', expect.anything());
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/documents');
    });
    expect(result.current.withdrawOpen).toBe(false);
  });

  it('confirmWithdraw surfaces a danger toast (not a crash) when the API errors', async () => {
    del.mockRejectedValue(new Error('cannot_delete_sealed'));
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    act(() => result.current.handleConfirmWithdraw());

    await waitFor(() => {
      expect(result.current.toast).toEqual({
        kind: 'danger',
        text: 'cannot_delete_sealed',
      });
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('confirmWithdraw is a no-op when no envelope is loaded yet', () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: undefined }), {
      wrapper: wrap(qc),
    });
    act(() => result.current.handleConfirmWithdraw());
    expect(del).not.toHaveBeenCalled();
  });
});

describe('useEnvelopeDetailController — handleSendReminder', () => {
  it('skips the network entirely and surfaces a toast when no signer is pending', async () => {
    const qc = freshClient();
    const e = env({
      signers: [signer({ status: 'completed', signed_at: '2026-04-01T01:00:00Z' })],
    });
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: e }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleSendReminder();
    });

    expect(post).not.toHaveBeenCalled();
    expect(result.current.toast).toEqual({
      kind: 'danger',
      text: 'No one is waiting on a signature.',
    });
  });

  it('POSTs once per pending signer and reports the success copy in the toast', async () => {
    post.mockResolvedValue({ status: 202, data: null });
    const qc = freshClient();
    const e = env({
      signers: [
        signer({ id: 's1', status: 'awaiting' }),
        signer({ id: 's2', name: 'B', status: 'awaiting' }),
        signer({ id: 's3', name: 'C', status: 'completed', signed_at: '2026-04-01T01:00:00Z' }),
      ],
    });
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: e }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleSendReminder();
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledWith('/envelopes/env-1/signers/s1/remind', {}, expect.anything());
    expect(post).toHaveBeenCalledWith('/envelopes/env-1/signers/s2/remind', {}, expect.anything());
    expect(result.current.toast).toEqual({
      kind: 'success',
      text: 'Reminder sent to 2 signers.',
    });
    expect(result.current.remindInFlight).toBe(false);
  });

  it('reports the singular copy when exactly one reminder went out', async () => {
    post.mockResolvedValue({ status: 202, data: null });
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await result.current.handleSendReminder();
    });
    expect(result.current.toast).toEqual({ kind: 'success', text: 'Reminder sent to 1 signer.' });
  });

  it('aggregates partial throttling: some sent, some failed → success toast with the split', async () => {
    post.mockResolvedValueOnce({ status: 202, data: null });
    post.mockRejectedValueOnce(new Error('throttled'));
    const qc = freshClient();
    const e = env({
      signers: [signer({ id: 's1' }), signer({ id: 's2', name: 'B' })],
    });
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: e }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleSendReminder();
    });

    expect(result.current.toast).toEqual({
      kind: 'success',
      text: '1 reminder sent · 1 throttled.',
    });
  });

  it('returns the all-failed danger toast (singular) when the only signer was throttled', async () => {
    post.mockRejectedValue(new Error('throttled'));
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await result.current.handleSendReminder();
    });
    expect(result.current.toast?.kind).toBe('danger');
    expect(result.current.toast?.text).toMatch(/A signer was reminded in the last hour/i);
  });

  it('returns the all-failed danger toast (plural) when every signer was throttled', async () => {
    post.mockRejectedValue(new Error('throttled'));
    const qc = freshClient();
    const e = env({
      signers: [signer({ id: 's1' }), signer({ id: 's2', name: 'B' })],
    });
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: e }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await result.current.handleSendReminder();
    });
    expect(result.current.toast?.text).toMatch(/Signers were reminded in the last hour/i);
  });

  it('handleSendReminder is a no-op when envelope is undefined', async () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: undefined }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await result.current.handleSendReminder();
    });
    expect(post).not.toHaveBeenCalled();
  });
});

describe('useEnvelopeDetailController — handleDownload', () => {
  it('rejects unknown kinds without firing a request', async () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('not-a-kind');
    });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.downloadInFlight).toBeNull();
  });

  it('opens the sealed PDF in a new tab and surfaces the success toast', async () => {
    stubWindowOpen();
    get.mockResolvedValueOnce({
      data: { url: 'https://signed.example/seal.pdf', kind: 'sealed' },
      status: 200,
    });
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('sealed');
    });

    expect(get).toHaveBeenCalledWith(
      '/envelopes/env-1/download',
      expect.objectContaining({
        params: expect.objectContaining({ kind: 'sealed' }),
      }),
    );
    expect(result.current.toast?.kind).toBe('success');
    expect(result.current.toast?.text).toMatch(/Sealed PDF opened/i);
    expect(result.current.downloadInFlight).toBeNull();
  });

  it('falls back to the anchor flow when the popup is blocked (window.open returns null)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    get.mockResolvedValueOnce({
      data: { url: 'https://signed.example/orig.pdf', kind: 'original' },
      status: 200,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('original');
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(result.current.toast?.kind).toBe('success');
    expect(result.current.toast?.text).toMatch(/check your browser/i);
  });

  it('translates the file_not_ready slug into a friendly per-artifact message', async () => {
    stubWindowOpen();
    get.mockRejectedValueOnce(new Error('file_not_ready'));
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('audit');
    });

    expect(result.current.toast?.kind).toBe('danger');
    expect(result.current.toast?.text).toBe(
      'The audit trail has not been produced for this envelope yet.',
    );
  });

  it('bundle kind opens the sealed PDF in a new tab and downloads the audit trail (BUG-3 regression)', async () => {
    // Two `target="_blank"` anchors fired back-to-back lose the user
    // gesture on the second click and Chrome/Safari swallow it as a
    // popup. Exactly one anchor should carry `target=_blank` (sealed)
    // and the other the `download` attribute (audit) so the audit
    // never tries to spawn a popup.
    get.mockImplementation((_url: string, config: { params?: { kind?: string } }) => {
      const k = config?.params?.kind;
      return Promise.resolve({
        data: { url: `https://signed.example/${k}.pdf`, kind: k },
        status: 200,
      });
    });
    const clicked: Array<{ target: string; download: string; href: string }> = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureClick(this: HTMLAnchorElement) {
        clicked.push({ target: this.target, download: this.download, href: this.href });
      });
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('bundle');
    });

    expect(clickSpy).toHaveBeenCalledTimes(2);
    const blankTabs = clicked.filter((c) => c.target === '_blank');
    const downloads = clicked.filter((c) => c.download !== '');
    expect(blankTabs).toHaveLength(1);
    expect(blankTabs[0]?.href).toMatch(/sealed\.pdf$/);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.href).toMatch(/audit\.pdf$/);
    expect(downloads[0]?.target).not.toBe('_blank');
    expect(result.current.toast?.kind).toBe('success');
    expect(result.current.toast?.text).toMatch(/audit trail downloaded/i);
  });

  it('bundle kind reports the file_not_ready friendly copy when the artifact is missing', async () => {
    get.mockRejectedValue(new Error('file_not_ready'));
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.handleDownload('bundle');
    });

    expect(result.current.toast).toEqual({
      kind: 'danger',
      text: 'The sealed artifacts have not been produced yet.',
    });
  });
});

describe('useEnvelopeDetailController — handleViewAudit', () => {
  it('flips auditInFlight while the request is in flight and clears it after', async () => {
    stubWindowOpen();
    let resolveDownload: (v: unknown) => void = () => {};
    get.mockReturnValueOnce(
      new Promise((res) => {
        resolveDownload = res;
      }),
    );
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.handleViewAudit();
    });
    await waitFor(() => expect(result.current.auditInFlight).toBe(true));

    await act(async () => {
      resolveDownload({
        data: { url: 'https://signed.example/audit.pdf', kind: 'audit' },
        status: 200,
      });
      await pending;
    });
    expect(result.current.auditInFlight).toBe(false);
  });

  it('handleViewAudit is a no-op when envelope is undefined', async () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: undefined }), {
      wrapper: wrap(qc),
    });
    await act(async () => {
      await result.current.handleViewAudit();
    });
    expect(get).not.toHaveBeenCalled();
  });
});

describe('useEnvelopeDetailController — navigation', () => {
  it('handleBack pushes /documents', () => {
    const qc = freshClient();
    const { result } = renderHook(() => useEnvelopeDetailController({ envelope: env() }), {
      wrapper: wrap(qc),
    });
    act(() => result.current.handleBack());
    expect(navigate).toHaveBeenCalledWith('/documents');
  });
});
