import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACK_ONLINE_MS, RECHECK_MS, useOnlineStatus } from './useOnlineStatus';

function setOnLine(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useOnlineStatus', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    setOnLine(true);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('is idle while the browser is online', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toEqual({ phase: 'idle', offline: false });
  });

  it('starts offline when the browser already is', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.phase).toBe('offline');
    expect(result.current.offline).toBe(true);
  });

  it('goes offline, reconnecting, back online for 2 s, then idle', async () => {
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.phase).toBe('offline');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.phase).toBe('reconnecting');
    expect(result.current.offline).toBe(true);

    await flush();
    expect(result.current.phase).toBe('back');
    expect(result.current.offline).toBe(false);

    act(() => {
      vi.advanceTimersByTime(BACK_ONLINE_MS);
    });
    expect(result.current.phase).toBe('idle');
  });

  it('keeps reconnecting and rechecks while the health ping fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(result.current.phase).toBe('reconnecting');

    act(() => {
      vi.advanceTimersByTime(RECHECK_MS);
    });
    await flush();
    expect(result.current.phase).toBe('back');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears its timers on unmount', async () => {
    const { result, unmount } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(result.current.phase).toBe('back');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
