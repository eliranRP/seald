import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '@/styles/theme';
import { useDriveImport } from './useDriveImport';
import * as conversionApi from './conversionApi';

vi.mock('./conversionApi', async (orig) => {
  const real = await orig<typeof conversionApi>();
  return {
    ...real,
    startConversion: vi.fn(),
    pollConversion: vi.fn(),
    cancelConversion: vi.fn(),
    fetchConvertedPdf: vi.fn(),
  };
});

const startConversion = vi.mocked(conversionApi.startConversion);
const pollConversion = vi.mocked(conversionApi.pollConversion);
const cancelConversion = vi.mocked(conversionApi.cancelConversion);
const fetchConvertedPdf = vi.mocked(conversionApi.fetchConvertedPdf);

function wrapper({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <ThemeProvider theme={seald}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}

const PDF_FILE = {
  id: 'drive-pdf-1',
  name: 'Contract.pdf',
  mimeType: 'application/pdf',
} as const;

const DOC_FILE = {
  id: 'drive-doc-1',
  name: 'Notes',
  mimeType: 'application/vnd.google-apps.document',
} as const;

describe('useDriveImport', () => {
  beforeEach(() => {
    startConversion.mockReset();
    pollConversion.mockReset();
    cancelConversion.mockReset();
    fetchConvertedPdf.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('PDF happy path: starts conversion, polls done, fetches asset, fires onReady with a File', async () => {
    startConversion.mockResolvedValue({ jobId: 'job-pdf', status: 'pending' });
    pollConversion.mockResolvedValue({
      jobId: 'job-pdf',
      status: 'done',
      assetUrl: 'https://signed.example/pdf',
    });
    const blob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], {
      type: 'application/pdf',
    });
    fetchConvertedPdf.mockResolvedValue(blob);

    const onReady = vi.fn();
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady, pollIntervalMs: 5 }),
      {
        wrapper,
      },
    );

    await act(async () => {
      result.current.beginImport(PDF_FILE);
    });

    // First poll fires immediately after start resolves.
    await waitFor(() => {
      expect(fetchConvertedPdf).toHaveBeenCalledWith('https://signed.example/pdf');
    });
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
    const arg = onReady.mock.calls[0]?.[0] as File;
    expect(arg).toBeInstanceOf(File);
    expect(arg.name).toBe('Contract.pdf');
    expect(arg.type).toBe('application/pdf');
    expect(result.current.state.kind).toBe('idle');
  });

  it('Doc path: polls until done then fetches asset and fires onReady', async () => {
    startConversion.mockResolvedValue({ jobId: 'job-doc', status: 'pending' });
    pollConversion
      .mockResolvedValueOnce({ jobId: 'job-doc', status: 'converting' })
      .mockResolvedValueOnce({ jobId: 'job-doc', status: 'converting' })
      .mockResolvedValueOnce({
        jobId: 'job-doc',
        status: 'done',
        assetUrl: 'https://signed.example/doc.pdf',
      });
    fetchConvertedPdf.mockResolvedValue(
      new Blob([new Uint8Array([0x25])], { type: 'application/pdf' }),
    );

    const onReady = vi.fn();
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady, pollIntervalMs: 5 }),
      {
        wrapper,
      },
    );

    await act(async () => {
      result.current.beginImport(DOC_FILE);
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const arg = onReady.mock.calls[0]?.[0] as File;
    expect(arg).toBeInstanceOf(File);
    expect(arg.name).toBe('Notes.pdf');
    expect(pollConversion).toHaveBeenCalledTimes(3);
  });

  it('cancel: DELETEs the job and resets to idle without firing onReady', async () => {
    startConversion.mockResolvedValue({ jobId: 'job-cancel', status: 'pending' });
    pollConversion.mockResolvedValue({ jobId: 'job-cancel', status: 'converting' });
    cancelConversion.mockResolvedValue();

    const onReady = vi.fn();
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady, pollIntervalMs: 5 }),
      {
        wrapper,
      },
    );

    await act(async () => {
      result.current.beginImport(DOC_FILE);
    });
    await waitFor(() => expect(result.current.state.kind).toBe('running'));

    await act(async () => {
      await result.current.cancelImport();
    });

    expect(cancelConversion).toHaveBeenCalledWith('job-cancel');
    expect(result.current.state.kind).toBe('idle');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('failed: surfaces the named error code in state.error', async () => {
    startConversion.mockResolvedValue({ jobId: 'job-fail', status: 'pending' });
    pollConversion.mockResolvedValue({
      jobId: 'job-fail',
      status: 'failed',
      errorCode: 'unsupported-mime',
    });

    const onReady = vi.fn();
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady, pollIntervalMs: 5 }),
      {
        wrapper,
      },
    );

    await act(async () => {
      result.current.beginImport(DOC_FILE);
    });

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    if (result.current.state.kind === 'failed') {
      expect(result.current.state.error).toBe('unsupported-mime');
    }
    expect(onReady).not.toHaveBeenCalled();
  });

  it('start error: surfaces synthesized failed state when POST throws', async () => {
    startConversion.mockRejectedValue(new Error('boom'));

    const onReady = vi.fn();
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady, pollIntervalMs: 5 }),
      {
        wrapper,
      },
    );

    await act(async () => {
      result.current.beginImport(DOC_FILE);
    });

    await waitFor(() => expect(result.current.state.kind).toBe('failed'));
    if (result.current.state.kind === 'failed') {
      expect(result.current.state.error).toBe('conversion-failed');
    }
  });

  it('reset() clears a failed state back to idle so the picker can re-open', async () => {
    startConversion.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () => useDriveImport({ accountId: 'acct-1', onReady: vi.fn(), pollIntervalMs: 5 }),
      { wrapper },
    );
    await act(async () => {
      result.current.beginImport(DOC_FILE);
    });
    await waitFor(() => expect(result.current.state.kind).toBe('failed'));

    act(() => {
      result.current.reset();
    });
    expect(result.current.state.kind).toBe('idle');
  });
});
