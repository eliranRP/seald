import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDownloadPdf } from '../useDownloadPdf';

describe('useDownloadPdf', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-object-url');
    revokeObjectURL = vi.fn();
    // jsdom doesn't implement these.
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    clickSpy = vi.fn();
    // Spy on every anchor's click — capture-phase listener fires before the
    // hook's manual `a.click()` would otherwise no-op under jsdom.
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the URL, creates an object URL, and clicks a hidden anchor with the cleaned filename', async () => {
    const blob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      blob: async () => blob,
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useDownloadPdf({
        getUrl: () => 'https://signed.example/pdf?token=abc',
        filename: 'Master Services Agreement',
      }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(fetchMock).toHaveBeenCalledWith('https://signed.example/pdf?token=abc');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Filename ends with .pdf and stays human-friendly.
    const lastCallContext = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(lastCallContext.download).toBe('Master Services Agreement.pdf');
    expect(lastCallContext.href).toContain('blob:mock-object-url');

    // Revoke is deferred behind setTimeout(0); flush it.
    await act(async () => {
      vi.runAllTimers();
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url');
  });

  it('downloads from a Blob directly when getBlob is provided', async () => {
    const blob = new Blob(['%PDF-fake'], { type: 'application/pdf' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useDownloadPdf({ getBlob: () => blob, filename: 'My File.pdf' }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    const ctx = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(ctx.download).toBe('My File.pdf');
  });

  it('exposes an error and never throws past download() unhandled when fetch fails', async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, blob: async () => new Blob() }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useDownloadPdf({ getUrl: () => 'https://signed.example/pdf', filename: 'Doc' }),
    );

    await act(async () => {
      await expect(result.current.download()).rejects.toThrow(/PDF fetch failed/);
    });
    await waitFor(() => {
      expect(result.current.error?.message).toMatch(/PDF fetch failed/);
    });
  });

  it('strips unsafe characters from the filename', async () => {
    const blob = new Blob(['x'], { type: 'application/pdf' });
    const { result } = renderHook(() =>
      useDownloadPdf({ getBlob: () => blob, filename: 'weird/name?<doc>' }),
    );
    await act(async () => {
      await result.current.download();
    });
    const ctx = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(ctx.download).toMatch(/\.pdf$/);
    expect(ctx.download).not.toMatch(/[/?<>]/);
  });
});
