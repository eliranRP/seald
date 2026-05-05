import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '../../../lib/api/apiClient';
// eslint-disable-next-line import/first
import { useAccountActions } from '../useAccountActions';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
  del.mockReset();
  // Stub URL.createObjectURL / revokeObjectURL — jsdom doesn't ship them.
  // We re-stub on every test so spy state is fresh.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'blob:fake'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAccountActions — exportData', () => {
  it('downloads the export and saves with the API-suggested filename', async () => {
    const blob = new Blob(['{"meta":{}}'], { type: 'application/json' });
    get.mockResolvedValueOnce({
      data: blob,
      headers: {
        'content-disposition': 'attachment; filename="seald-export-abc-2026-04-30.json"',
      },
    });

    // Spy on anchor click — no real download happens in jsdom.
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        // Replace the click handler so our test sees it without firing
        // jsdom's no-op anchor navigation.
        Object.defineProperty(el, 'click', { value: clickSpy });
      }
      return el;
    });

    const { result } = renderHook(() => useAccountActions());
    await act(async () => {
      await result.current.exportData();
    });

    expect(get).toHaveBeenCalledWith('/me/export', { responseType: 'blob' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(result.current.isExporting).toBe(false);
    expect(result.current.lastError).toBeNull();
    createSpy.mockRestore();
  });

  it('reports the error message when /me/export fails', async () => {
    get.mockRejectedValueOnce(new Error('Server fell over'));
    const onError = vi.fn();
    const { result } = renderHook(() => useAccountActions({ onError }));
    await act(async () => {
      await result.current.exportData();
    });
    expect(onError).toHaveBeenCalledWith('Server fell over');
    expect(result.current.lastError).toBe('Server fell over');
    expect(result.current.isExporting).toBe(false);
  });

  it('falls back to a synthesized filename when the API omits Content-Disposition', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    get.mockResolvedValueOnce({ data: blob, headers: {} });
    // Capture the anchor's `download` attr — that's where the filename
    // lands. We don't need to click; we just need to inspect the element.
    let captured: string | null = null;
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: vi.fn(() => {
            captured = (el as HTMLAnchorElement).download;
          }),
        });
      }
      return el;
    });
    const { result } = renderHook(() => useAccountActions());
    await act(async () => {
      await result.current.exportData();
    });
    expect(captured).toMatch(/^seald-export-\d{4}-\d{2}-\d{2}\.json$/);
    createSpy.mockRestore();
  });
});

describe('useAccountActions — deleteAccount', () => {
  it('aborts silently when the user cancels the prompt', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const onAccountDeleted = vi.fn();
    const { result } = renderHook(() => useAccountActions({ onAccountDeleted }));
    await act(async () => {
      await result.current.deleteAccount();
    });
    expect(del).not.toHaveBeenCalled();
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it('aborts silently when the user types the wrong phrase', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('delete my account');
    const { result } = renderHook(() => useAccountActions());
    await act(async () => {
      await result.current.deleteAccount();
    });
    expect(del).not.toHaveBeenCalled();
  });

  it('calls DELETE /me with the literal confirm phrase, then onAccountDeleted', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('DELETE_MY_ACCOUNT');
    del.mockResolvedValueOnce(undefined);
    const onAccountDeleted = vi.fn();
    const { result } = renderHook(() => useAccountActions({ onAccountDeleted }));
    await act(async () => {
      await result.current.deleteAccount();
    });
    expect(del).toHaveBeenCalledWith('/me', { data: { confirm: 'DELETE_MY_ACCOUNT' } });
    expect(onAccountDeleted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isDeleting).toBe(false));
    expect(result.current.lastError).toBeNull();
  });

  it('reports a friendly error when the admin call fails (503)', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('DELETE_MY_ACCOUNT');
    del.mockRejectedValueOnce(new Error('admin_api_unavailable'));
    const onAccountDeleted = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useAccountActions({ onAccountDeleted, onError }));
    await act(async () => {
      await result.current.deleteAccount();
    });
    expect(onError).toHaveBeenCalledWith('admin_api_unavailable');
    expect(onAccountDeleted).not.toHaveBeenCalled();
    expect(result.current.lastError).toBe('admin_api_unavailable');
  });
});
