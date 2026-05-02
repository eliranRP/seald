import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const getPdfSignedUrl = vi.fn<() => Promise<string>>();
vi.mock('@/features/signing', async () => {
  const actual = (await vi.importActual('@/features/signing')) as Record<string, unknown>;
  return {
    ...actual,
    getPdfSignedUrl: () => getPdfSignedUrl(),
  };
});

// eslint-disable-next-line import/first
import { useSigningPdfSource } from './useSigningPdfSource';

beforeEach(() => {
  getPdfSignedUrl.mockReset();
});

describe('useSigningPdfSource', () => {
  it('starts as null and resolves to the signed URL once the API replies', async () => {
    getPdfSignedUrl.mockResolvedValueOnce('https://signed.example/pdf?token=abc');
    const { result } = renderHook(() => useSigningPdfSource('env-1'));
    expect(result.current).toBeNull();
    await waitFor(() => {
      expect(result.current).toBe('https://signed.example/pdf?token=abc');
    });
    expect(getPdfSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('does not call the API when envelopeId is undefined', async () => {
    const { result } = renderHook(() => useSigningPdfSource(undefined));
    // Give the (suppressed) effect a tick to (not) fire.
    await act(async () => {
      await Promise.resolve();
    });
    expect(getPdfSignedUrl).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('swallows API failures and stays null (DocumentPageCanvas owns the placeholder)', async () => {
    getPdfSignedUrl.mockRejectedValueOnce(new Error('signed-url 500'));
    const { result } = renderHook(() => useSigningPdfSource('env-2'));
    // Wait one microtask flush; result must remain null without throwing.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
  });

  it('refetches when envelopeId changes', async () => {
    getPdfSignedUrl
      .mockResolvedValueOnce('https://signed.example/a')
      .mockResolvedValueOnce('https://signed.example/b');
    const { result, rerender } = renderHook(({ id }: { id: string }) => useSigningPdfSource(id), {
      initialProps: { id: 'env-a' },
    });
    await waitFor(() => expect(result.current).toBe('https://signed.example/a'));
    rerender({ id: 'env-b' });
    await waitFor(() => expect(result.current).toBe('https://signed.example/b'));
    expect(getPdfSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('cancellation guard: a late-resolving fetch from a stale envelopeId does not overwrite the new value', async () => {
    // Issue the slow A request, then switch to B which resolves first.
    let resolveA: (v: string) => void = () => {};
    const slowA = new Promise<string>((resolve) => {
      resolveA = resolve;
    });
    getPdfSignedUrl.mockReturnValueOnce(slowA).mockResolvedValueOnce('B-ok');
    const { result, rerender } = renderHook(({ id }: { id: string }) => useSigningPdfSource(id), {
      initialProps: { id: 'env-a' },
    });
    rerender({ id: 'env-b' });
    await waitFor(() => expect(result.current).toBe('B-ok'));
    // Now resolve A — without the `cancelled` flag this would overwrite
    // the newer B URL with stale A content (the bug the guard prevents).
    await act(async () => {
      resolveA('A-late');
      await Promise.resolve();
    });
    expect(result.current).toBe('B-ok');
  });
});
