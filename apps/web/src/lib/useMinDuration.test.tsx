import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMinDuration } from './useMinDuration';

describe('useMinDuration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds the flag true for at least the minimum duration', () => {
    const { result, rerender } = renderHook(({ flag }) => useMinDuration(flag, 2000), {
      initialProps: { flag: true },
    });
    expect(result.current).toBe(true);

    // Real fetch finishes in 200 ms.
    rerender({ flag: false });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);

    // After the remaining hold window (total 2000ms since start) it drops.
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(result.current).toBe(false);
  });

  it('drops immediately if the minimum has already elapsed', () => {
    const { result, rerender } = renderHook(({ flag }) => useMinDuration(flag, 2000), {
      initialProps: { flag: true },
    });
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    rerender({ flag: false });
    expect(result.current).toBe(false);
  });

  it('re-arms the timer when the flag flips true again', () => {
    const { result, rerender } = renderHook(({ flag }) => useMinDuration(flag, 1000), {
      initialProps: { flag: true },
    });
    rerender({ flag: false });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Now a new fetch starts mid-hold — the timer should reset.
    rerender({ flag: true });
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    // Still true because the new fetch hasn't finished.
    expect(result.current).toBe(true);
    rerender({ flag: false });
    // Another 100ms of the new window gives a total hold of 1200ms — plenty.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(false);
  });
});
