// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedCallback } from './useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire the callback synchronously when invoked', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(cb, 600));
    act(() => {
      result.current('payload');
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires once after the delay if no further calls arrive', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(cb, 600));
    act(() => {
      result.current('first');
    });
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('first');
  });

  it('only fires once with the latest argument when called repeatedly within the delay', () => {
    const cb = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(cb, 600));
    act(() => {
      result.current('a');
    });
    act(() => {
      vi.advanceTimersByTime(300);
      result.current('b');
    });
    act(() => {
      vi.advanceTimersByTime(300);
      result.current('c');
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('c');
  });

  it('uses the most recent callback closure when fired (so stale state is not captured)', () => {
    const captured: string[] = [];
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useDebouncedCallback((arg: string) => {
          captured.push(`${value}:${arg}`);
        }, 600),
      { initialProps: { value: 'v1' } },
    );
    act(() => {
      result.current('typed');
    });
    rerender({ value: 'v2' });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    // Fired with the post-rerender closure → captured "v2:typed", not "v1:typed".
    expect(captured).toEqual(['v2:typed']);
  });

  it('cancels the pending call when the component unmounts', () => {
    const cb = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(cb, 600));
    act(() => {
      result.current('queued');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(cb).not.toHaveBeenCalled();
  });
});
