import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_VIEWPORT_QUERY, useIsMobileViewport } from './useIsMobileViewport';

interface FakeMql {
  matches: boolean;
  media: string;
  onchange: null;
  listeners: Array<(e: MediaQueryListEvent) => void>;
  addEventListener: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: 'change', cb: (e: MediaQueryListEvent) => void) => void;
  addListener: (cb: (e: MediaQueryListEvent) => void) => void;
  removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
  dispatchEvent: () => boolean;
}

function installMatchMedia(initialMatches: boolean): FakeMql {
  const mql: FakeMql = {
    matches: initialMatches,
    media: MOBILE_VIEWPORT_QUERY,
    onchange: null,
    listeners: [],
    addEventListener: (_t, cb) => {
      mql.listeners.push(cb);
    },
    removeEventListener: (_t, cb) => {
      mql.listeners = mql.listeners.filter((l) => l !== cb);
    },
    addListener: (cb) => {
      mql.listeners.push(cb);
    },
    removeListener: (cb) => {
      mql.listeners = mql.listeners.filter((l) => l !== cb);
    },
    dispatchEvent: () => false,
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

describe('useIsMobileViewport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries the mobile breakpoint on mount and reports the live value', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobileViewport());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(MOBILE_VIEWPORT_QUERY);
  });

  it('returns false when the viewport is desktop-sized', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobileViewport());
    expect(result.current).toBe(false);
  });

  it('subscribes to change events and updates when the viewport flips', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobileViewport());
    expect(result.current).toBe(false);
    act(() => {
      mql.matches = true;
      mql.listeners.forEach((cb) =>
        cb({ matches: true, media: MOBILE_VIEWPORT_QUERY } as MediaQueryListEvent),
      );
    });
    expect(result.current).toBe(true);
  });

  it('removes its listener on unmount', () => {
    const mql = installMatchMedia(true);
    const { unmount } = renderHook(() => useIsMobileViewport());
    expect(mql.listeners.length).toBe(1);
    unmount();
    expect(mql.listeners.length).toBe(0);
  });
});
