import { act, renderHook, waitFor } from '@testing-library/react';
import type * as ReactModule from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getDocument = vi.hoisted(() => vi.fn());
const updateGate = vi.hoisted(() => ({ closed: false, calls: 0 }));

vi.mock('pdfjs-dist', () => ({
  getDocument: (src: unknown) => getDocument(src),
  GlobalWorkerOptions: { workerSrc: '' },
}));

// Count setState calls that happen after the test closes the gate. The
// hook's cancellation checks are what keep this at zero; React 19 itself
// does not warn when a detached render calls a setter.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return {
    ...actual,
    useState: (<T,>(initial: T | (() => T)) => {
      const tuple = actual.useState(initial);
      const setState = tuple[1];
      const wrapped = (action: T | ((prev: T) => T)) => {
        if (updateGate.closed) updateGate.calls += 1;
        return setState(action);
      };
      return [tuple[0], wrapped] as typeof tuple;
    }) as typeof actual.useState,
  };
});

// eslint-disable-next-line import/first
import { usePdfDocument } from './pdf';

const URL_A = 'https://example.test/a.pdf';
const URL_B = 'https://example.test/b.pdf';

type FakeDoc = {
  numPages: number;
  loadingTask: { destroy: () => Promise<void>; promise: Promise<unknown> };
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createLoadingTask(numPages: number): {
  task: { promise: Promise<FakeDoc>; destroy: ReturnType<typeof vi.fn> };
  destroy: ReturnType<typeof vi.fn>;
  settle: () => void;
} {
  const pending = deferred<FakeDoc>();
  const destroy = vi.fn(() => Promise.resolve());
  const task = { promise: pending.promise, destroy };
  return {
    task,
    destroy,
    settle() {
      pending.resolve({ numPages, loadingTask: task });
    },
  };
}

function pendingFile(pending: Promise<ArrayBuffer>): File {
  const file = new File([new Uint8Array([37, 80, 68, 70])], 'doc.pdf', {
    type: 'application/pdf',
  });
  // jsdom's File does not expose `arrayBuffer` as a spyable own property.
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: () => pending,
  });
  return file;
}

function closeUpdates(): void {
  updateGate.closed = true;
  updateGate.calls = 0;
}

afterEach(() => {
  updateGate.closed = false;
  updateGate.calls = 0;
  getDocument.mockReset();
});

describe('usePdfDocument cleanup', () => {
  it('destroys the in-flight loading task when unmounted during load', () => {
    const first = createLoadingTask(2);
    getDocument.mockReturnValue(first.task);

    const { unmount } = renderHook(() => usePdfDocument(URL_A));

    expect(getDocument).toHaveBeenCalledTimes(1);
    unmount();
    expect(first.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not setState after unmount once the in-flight load settles', async () => {
    const first = createLoadingTask(4);
    getDocument.mockReturnValue(first.task);

    const { unmount } = renderHook(() => usePdfDocument(URL_A));
    unmount();
    closeUpdates();

    await act(async () => {
      first.settle();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(first.destroy).toHaveBeenCalled();
    expect(updateGate.calls).toBe(0);
  });

  it('destroys the in-flight task when the source changes mid-load', async () => {
    const first = createLoadingTask(9);
    const second = createLoadingTask(6);
    getDocument.mockReturnValueOnce(first.task).mockReturnValueOnce(second.task);

    const { result, rerender } = renderHook(({ src }) => usePdfDocument(src), {
      initialProps: { src: URL_A },
    });

    rerender({ src: URL_B });

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(getDocument).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.settle();
      await Promise.resolve();
    });

    expect(result.current.doc).toBeNull();
    expect(result.current.numPages).not.toBe(9);
  });

  it('destroys the previous loading task when the source changes after load', async () => {
    const first = createLoadingTask(2);
    const second = createLoadingTask(5);
    getDocument.mockReturnValueOnce(first.task).mockReturnValueOnce(second.task);

    const { result, rerender } = renderHook(({ src }) => usePdfDocument(src), {
      initialProps: { src: URL_A },
    });

    await act(async () => {
      first.settle();
    });
    await waitFor(() => expect(result.current.numPages).toBe(2));
    expect(first.destroy).not.toHaveBeenCalled();

    rerender({ src: URL_B });
    expect(first.destroy).toHaveBeenCalledTimes(1);

    await act(async () => {
      second.settle();
    });
    await waitFor(() => expect(result.current.numPages).toBe(5));
    expect(first.destroy).toHaveBeenCalledTimes(2);
  });

  it('does not open a document or setState when unmounted during arrayBuffer', async () => {
    const bytes = deferred<ArrayBuffer>();
    const file = pendingFile(bytes.promise);

    const { unmount } = renderHook(() => usePdfDocument(file));
    expect(getDocument).not.toHaveBeenCalled();

    unmount();
    closeUpdates();

    await act(async () => {
      bytes.resolve(new ArrayBuffer(8));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getDocument).not.toHaveBeenCalled();
    expect(updateGate.calls).toBe(0);
  });

  it('drops a file read that is still in flight when the source changes', async () => {
    const bytes = deferred<ArrayBuffer>();
    const second = createLoadingTask(6);
    getDocument.mockReturnValue(second.task);
    const file = pendingFile(bytes.promise);

    const { result, rerender } = renderHook(
      ({ source }: { source: File | string }) => usePdfDocument(source),
      { initialProps: { source: file as File | string } },
    );

    rerender({ source: URL_B });

    await act(async () => {
      bytes.resolve(new ArrayBuffer(8));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(getDocument.mock.calls[0]?.[0]).toEqual({ url: URL_B });

    await act(async () => {
      second.settle();
    });
    await waitFor(() => expect(result.current.numPages).toBe(6));
  });
});
