import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { DRIVE_IMPORT_DONE_MS, useDriveImportOverlay } from '../useDriveImportOverlay';
import * as conversionApi from '../conversionApi';

vi.mock('../conversionApi', async (orig) => {
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

const FIRST = { id: 'drive-1', name: 'First', mimeType: 'application/pdf' } as const;
const SECOND = { id: 'drive-2', name: 'Second', mimeType: 'application/pdf' } as const;

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderOverlay(onFile: (file: File) => void) {
  return renderHook(() => useDriveImportOverlay({ accountId: 'acct-1', onFile }));
}

beforeEach(() => {
  vi.useFakeTimers();
  startConversion.mockReset();
  pollConversion.mockReset();
  cancelConversion.mockReset();
  fetchConvertedPdf.mockReset();
  startConversion.mockResolvedValue({ jobId: 'job-1', status: 'pending' });
  pollConversion.mockResolvedValue({ jobId: 'job-1', status: 'done', assetUrl: 'https://x/pdf' });
  fetchConvertedPdf.mockResolvedValue(new Blob([new Uint8Array([0x25])]));
  cancelConversion.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDriveImportOverlay', () => {
  it('walks fetching -> done -> closed and hands the file over after the done window', async () => {
    const onFile = vi.fn();
    const { result } = renderOverlay(onFile);
    expect(result.current.phase).toBeNull();
    act(() => {
      result.current.beginImport(FIRST);
    });
    expect(result.current.phase).toBe('fetching');
    expect(result.current.fileName).toBe('First');
    await flush();
    expect(result.current.phase).toBe('done');
    expect(onFile).not.toHaveBeenCalled();
    await flush(DRIVE_IMPORT_DONE_MS);
    expect(result.current.phase).toBeNull();
    expect(onFile).toHaveBeenCalledTimes(1);
    expect((onFile.mock.calls[0]?.[0] as File).name).toBe('First.pdf');
  });

  it('shows converting while the job runs', async () => {
    pollConversion.mockResolvedValue({ jobId: 'job-1', status: 'converting' });
    const { result } = renderOverlay(vi.fn());
    act(() => {
      result.current.beginImport(FIRST);
    });
    await flush();
    expect(result.current.phase).toBe('converting');
  });

  it('cancel inside the done window drops the hand-off', async () => {
    const onFile = vi.fn();
    const { result } = renderOverlay(onFile);
    act(() => {
      result.current.beginImport(FIRST);
    });
    await flush();
    expect(result.current.phase).toBe('done');
    act(() => {
      result.current.cancel();
    });
    expect(result.current.phase).toBeNull();
    await flush(DRIVE_IMPORT_DONE_MS * 2);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('a new import inside the done window drops the earlier file', async () => {
    const onFile = vi.fn();
    const { result } = renderOverlay(onFile);
    act(() => {
      result.current.beginImport(FIRST);
    });
    await flush();
    expect(result.current.phase).toBe('done');
    pollConversion.mockResolvedValue({ jobId: 'job-2', status: 'converting' });
    act(() => {
      result.current.beginImport(SECOND);
    });
    expect(result.current.phase).toBe('fetching');
    expect(result.current.fileName).toBe('Second');
    await flush(DRIVE_IMPORT_DONE_MS * 2);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('cancel while the job runs tells the server and closes the overlay', async () => {
    pollConversion.mockResolvedValue({ jobId: 'job-1', status: 'converting' });
    const { result } = renderOverlay(vi.fn());
    act(() => {
      result.current.beginImport(FIRST);
    });
    await flush();
    act(() => {
      result.current.cancel();
    });
    expect(cancelConversion).toHaveBeenCalledWith('job-1');
    expect(result.current.phase).toBeNull();
    expect(result.current.state.kind).toBe('idle');
  });

  it('unmount inside the done window never hands the file over', async () => {
    const onFile = vi.fn();
    const { result, unmount } = renderOverlay(onFile);
    act(() => {
      result.current.beginImport(FIRST);
    });
    await flush();
    unmount();
    await flush(DRIVE_IMPORT_DONE_MS * 2);
    expect(onFile).not.toHaveBeenCalled();
  });
});
