import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getPdfSignedUrl = vi.fn<(signal?: AbortSignal, documentId?: string) => Promise<string>>();
vi.mock('@/features/signing', async () => {
  const actual = (await vi.importActual('@/features/signing')) as Record<string, unknown>;
  return {
    ...actual,
    getPdfSignedUrl: (signal?: AbortSignal, documentId?: string) =>
      getPdfSignedUrl(signal, documentId),
  };
});

import { useSigningPdfSource } from '../useSigningPdfSource';

beforeEach(() => {
  getPdfSignedUrl.mockReset();
});

describe('useSigningPdfSource with a document id', () => {
  it('asks for that document and clears the previous file while the next one loads', async () => {
    getPdfSignedUrl.mockImplementation(
      async (_signal, documentId) => `https://signed/${documentId ?? 'first'}.pdf`,
    );
    const { result, rerender } = renderHook(
      ({ doc }: { doc: string }) => useSigningPdfSource('env-1', doc),
      { initialProps: { doc: 'doc-a' } },
    );
    await waitFor(() => {
      expect(result.current).toBe('https://signed/doc-a.pdf');
    });
    expect(getPdfSignedUrl).toHaveBeenLastCalledWith(undefined, 'doc-a');

    getPdfSignedUrl.mockImplementation(() => new Promise(() => {}));
    rerender({ doc: 'doc-b' });
    // Never show document A's file on document B.
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(getPdfSignedUrl).toHaveBeenLastCalledWith(undefined, 'doc-b');
  });

  it('still calls with no arguments when there is no document id (single-document envelope)', async () => {
    getPdfSignedUrl.mockResolvedValue('https://signed/one.pdf');
    const { result } = renderHook(() => useSigningPdfSource('env-1'));
    await waitFor(() => {
      expect(result.current).toBe('https://signed/one.pdf');
    });
    expect(getPdfSignedUrl).toHaveBeenCalledWith(undefined, undefined);
  });
});
