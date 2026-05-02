import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCanvasScroll } from './useCanvasScroll';

interface FakeIO {
  observe: (el: Element) => void;
  unobserve: (el: Element) => void;
  disconnect: () => void;
}

const observers: FakeIO[] = [];
const observerCallbacks: Array<(entries: ReadonlyArray<IntersectionObserverEntry>) => void> = [];

function installFakeIO(): void {
  class FakeIntersectionObserver implements FakeIO {
    constructor(cb: (entries: ReadonlyArray<IntersectionObserverEntry>) => void) {
      observerCallbacks.push(cb);
      observers.push(this);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeIntersectionObserver,
  });
  // jsdom lacks ResizeObserver; the hook tolerates undefined but having a
  // simple constructor avoids accidental no-ops if the layout effect ever
  // gains a hard dependency.
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
}

beforeEach(() => {
  observers.length = 0;
  observerCallbacks.length = 0;
  installFakeIO();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCanvasScroll', () => {
  it('clamps initialPage into [1, totalPages]', () => {
    const tooHigh = renderHook(() => useCanvasScroll({ initialPage: 99, totalPages: 3 }));
    expect(tooHigh.result.current.currentPage).toBe(3);
    const tooLow = renderHook(() => useCanvasScroll({ initialPage: -5, totalPages: 3 }));
    expect(tooLow.result.current.currentPage).toBe(1);
  });

  it('re-clamps currentPage when totalPages shrinks (e.g. PDF metadata loads)', () => {
    const { result, rerender } = renderHook(
      ({ totalPages }: { totalPages: number }) => useCanvasScroll({ initialPage: 5, totalPages }),
      { initialProps: { totalPages: 10 } },
    );
    expect(result.current.currentPage).toBe(5);
    rerender({ totalPages: 2 });
    expect(result.current.currentPage).toBe(2);
  });

  it('uses page 1 as a minimum even when totalPages is 0', () => {
    const { result, rerender } = renderHook(
      ({ totalPages }: { totalPages: number }) => useCanvasScroll({ initialPage: 1, totalPages }),
      { initialProps: { totalPages: 1 } },
    );
    expect(result.current.currentPage).toBe(1);
    rerender({ totalPages: 0 });
    expect(result.current.currentPage).toBe(1);
  });

  it('seeds visiblePages with page 1 so the first paint shows something', () => {
    const { result } = renderHook(() => useCanvasScroll({ initialPage: 1, totalPages: 3 }));
    expect(result.current.visiblePages.has(1)).toBe(true);
  });

  it('setCanvasRefForPage / setPageWrapRefForPage register elements in the ref maps', () => {
    const { result } = renderHook(() => useCanvasScroll({ initialPage: 1, totalPages: 3 }));
    const canvas = document.createElement('div');
    const wrap = document.createElement('div');
    act(() => {
      result.current.setCanvasRefForPage(2)(canvas);
      result.current.setPageWrapRefForPage(2)(wrap);
    });
    expect(result.current.canvasRefsRef.current.get(2)).toBe(canvas);
    expect(result.current.pageWrapRefsRef.current.get(2)).toBe(wrap);
  });

  it('scrollToPage smooth-scrolls the wrap, eagerly marks the target visible, and updates currentPage', () => {
    const { result } = renderHook(() => useCanvasScroll({ initialPage: 1, totalPages: 3 }));
    const wrap = document.createElement('div');
    const scrollIntoView = vi.fn();
    Object.defineProperty(wrap, 'scrollIntoView', { value: scrollIntoView });
    act(() => {
      result.current.setPageWrapRefForPage(2)(wrap);
    });
    act(() => {
      result.current.scrollToPage(2);
    });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(result.current.currentPage).toBe(2);
    expect(result.current.visiblePages.has(2)).toBe(true);
  });

  it('scrollToPage tolerates a missing wrap ref (no throw)', () => {
    const { result } = renderHook(() => useCanvasScroll({ initialPage: 1, totalPages: 3 }));
    expect(() => act(() => result.current.scrollToPage(3))).not.toThrow();
    expect(result.current.currentPage).toBe(3);
  });

  it('IntersectionObserver entries promote pages into the visible set and update currentPage', () => {
    // Pre-create the dom refs and inject them BEFORE the observer effect
    // runs (the effect bails when canvasScrollRef.current is null on mount).
    const root = document.createElement('div');
    const wrap = document.createElement('div');
    wrap.setAttribute('data-page', '4');
    const seededWraps = new Map<number, HTMLDivElement>([[4, wrap]]);

    const { result } = renderHook(() => {
      const hook = useCanvasScroll({ initialPage: 1, totalPages: 5 });
      // Seed during render — runs BEFORE the layout/effect that constructs
      // the IntersectionObserver, so the observer sees the populated refs.
      // The ref's `.current` is mutable per React's escape-hatch contract.
      (hook.canvasScrollRef as { current: HTMLDivElement | null }).current = root;
      for (const [page, el] of seededWraps) hook.pageWrapRefsRef.current.set(page, el);
      return hook;
    });

    const cb = observerCallbacks.at(-1);
    if (!cb) throw new Error('observer callback was never registered');
    act(() => {
      cb([
        {
          isIntersecting: true,
          intersectionRatio: 0.9,
          target: wrap,
        } as unknown as IntersectionObserverEntry,
      ]);
    });
    expect(result.current.visiblePages.has(4)).toBe(true);
    expect(result.current.currentPage).toBe(4);
  });

  it('observer entries are ignored while a programmatic scroll is in flight', () => {
    const root = document.createElement('div');
    const wrapTwo = document.createElement('div');
    wrapTwo.setAttribute('data-page', '2');
    Object.defineProperty(wrapTwo, 'scrollIntoView', { value: vi.fn() });
    const wrapFive = document.createElement('div');
    wrapFive.setAttribute('data-page', '5');

    const { result } = renderHook(() => {
      const hook = useCanvasScroll({ initialPage: 1, totalPages: 5 });
      (hook.canvasScrollRef as { current: HTMLDivElement | null }).current = root;
      hook.pageWrapRefsRef.current.set(2, wrapTwo);
      hook.pageWrapRefsRef.current.set(5, wrapFive);
      return hook;
    });

    act(() => {
      result.current.scrollToPage(2);
    });
    expect(result.current.currentPage).toBe(2);

    const cb = observerCallbacks.at(-1);
    if (!cb) throw new Error('observer callback was never registered');
    act(() => {
      cb([
        {
          isIntersecting: true,
          intersectionRatio: 1,
          target: wrapFive,
        } as unknown as IntersectionObserverEntry,
      ]);
    });
    // Suppression window blocks the observer-driven currentPage update.
    expect(result.current.currentPage).toBe(2);
  });
});
