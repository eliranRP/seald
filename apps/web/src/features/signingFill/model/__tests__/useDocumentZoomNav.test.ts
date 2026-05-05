import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  clampZoom,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  useDocumentZoomNav,
} from '../useDocumentZoomNav';

describe('clampZoom', () => {
  it('rounds to two decimals so floating-point creep does not stick the buttons disabled', () => {
    // 0.7 + 0.1 in IEEE-754 ≠ 0.8 — without rounding the disabled-edge
    // comparison `zoom >= ZOOM_MAX - 1e-6` would be off by tiny error
    // and the +/- buttons would oscillate in/out of disabled state.
    expect(clampZoom(0.7 + 0.1)).toBe(0.8);
  });

  it('clamps below ZOOM_MIN to ZOOM_MIN', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
  });

  it('clamps above ZOOM_MAX to ZOOM_MAX', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });

  it('passes a value already inside the band through (rounded)', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.25)).toBe(1.25);
  });
});

describe('useDocumentZoomNav — zoom state', () => {
  it('starts at ZOOM_DEFAULT, currentPage 1, zoomOut disabled at min after enough decrements', () => {
    const { result } = renderHook(() => useDocumentZoomNav({ totalPages: 3 }));
    expect(result.current.zoom).toBe(ZOOM_DEFAULT);
    expect(result.current.currentPage).toBe(1);
    // Step down until we hit the floor; zoomOutDisabled must flip true.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        result.current.zoomOut();
      });
    }
    expect(result.current.zoom).toBe(ZOOM_MIN);
    expect(result.current.zoomOutDisabled).toBe(true);
    expect(result.current.zoomInDisabled).toBe(false);
  });

  it('zoomIn ascends by ZOOM_STEP and disables zoomIn at the ceiling', () => {
    const { result } = renderHook(() => useDocumentZoomNav({ totalPages: 1 }));
    act(() => {
      result.current.zoomIn();
    });
    expect(result.current.zoom).toBe(ZOOM_DEFAULT + ZOOM_STEP);
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        result.current.zoomIn();
      });
    }
    expect(result.current.zoom).toBe(ZOOM_MAX);
    expect(result.current.zoomInDisabled).toBe(true);
  });

  it('resetZoom returns to ZOOM_DEFAULT regardless of current value', () => {
    const { result } = renderHook(() => useDocumentZoomNav({ totalPages: 1 }));
    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.zoom).not.toBe(ZOOM_DEFAULT);
    act(() => {
      result.current.resetZoom();
    });
    expect(result.current.zoom).toBe(ZOOM_DEFAULT);
  });
});

describe('useDocumentZoomNav — scrollToPage', () => {
  let scrollSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollSpy = vi.fn();
    document.body.innerHTML = `
      <div data-r-page="1"></div>
      <div data-r-page="2"></div>
      <div data-r-page="3"></div>
    `;
    document.querySelectorAll<HTMLElement>('[data-r-page]').forEach((el) => {
      // Override the no-op jsdom stub with a spy so we can assert behavior.
      Object.defineProperty(el, 'scrollIntoView', {
        configurable: true,
        value: scrollSpy,
      });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('finds the matching page node and scrollIntoView({behavior:"smooth"})', () => {
    const { result } = renderHook(() => useDocumentZoomNav({ totalPages: 3 }));
    act(() => {
      result.current.scrollToPage(2);
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('is a no-op when the requested page node does not exist', () => {
    const { result } = renderHook(() => useDocumentZoomNav({ totalPages: 3 }));
    act(() => {
      result.current.scrollToPage(99);
    });
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});

describe('useDocumentZoomNav — IntersectionObserver scroll-spy', () => {
  type Cb = (entries: IntersectionObserverEntry[]) => void;
  let cb: Cb | null;
  let observed: Element[];
  let disconnected: boolean;

  beforeEach(() => {
    cb = null;
    observed = [];
    disconnected = false;
    class FakeIO {
      constructor(callback: Cb) {
        cb = callback;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {
        disconnected = true;
      }
      unobserve() {
        /* noop */
      }
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO as unknown as typeof IntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('returns early without observing when scrollAreaRef is unattached', () => {
    renderHook(() => useDocumentZoomNav({ totalPages: 2 }));
    expect(observed).toHaveLength(0);
    expect(cb).toBeNull();
  });

  it('observes every [data-r-page] node, drives currentPage from the highest ratio, disconnects on cleanup', () => {
    // Pre-attach a real DOM tree, then run the hook with a custom
    // wrapper that wires the ref to that tree BEFORE the effect
    // commits. This mirrors what the real page does: the scroll area
    // mounts with its children already present.
    document.body.innerHTML = `
      <div id="scroll-root">
        <div data-r-page="1"></div>
        <div data-r-page="2"></div>
        <div data-r-page="3"></div>
      </div>
    `;
    const root = document.getElementById('scroll-root') as HTMLDivElement;

    function useTest(pages: number) {
      const api = useDocumentZoomNav({ totalPages: pages });
      // Attach the ref synchronously on the render that precedes the
      // effect. This is exactly equivalent to React assigning the ref
      // via JSX `<div ref={ref} />` for a node that is already in the
      // DOM before the effect runs.
      (api.scrollAreaRef as { current: HTMLDivElement | null }).current = root;
      return api;
    }

    const { result, rerender, unmount } = renderHook(({ pages }) => useTest(pages), {
      initialProps: { pages: 3 },
    });

    // Effect must have run, observed all three page nodes, and stashed
    // the IntersectionObserver callback.
    expect(observed).toHaveLength(3);
    expect(cb).not.toBeNull();

    // Synthesize an emission: page 2 has the highest ratio.
    act(() => {
      cb?.([
        { isIntersecting: true, intersectionRatio: 0.4, target: root.children[0]! },
        { isIntersecting: true, intersectionRatio: 0.9, target: root.children[1]! },
        { isIntersecting: false, intersectionRatio: 0, target: root.children[2]! },
      ] as unknown as IntersectionObserverEntry[]);
    });
    expect(result.current.currentPage).toBe(2);

    // No-intersection emissions must NOT update currentPage (defends the
    // `if (best)` guard against accidental zeroing on a scroll-out).
    act(() => {
      cb?.([
        { isIntersecting: false, intersectionRatio: 0, target: root.children[0]! },
      ] as unknown as IntersectionObserverEntry[]);
    });
    expect(result.current.currentPage).toBe(2);

    // Re-render with a different totalPages → the effect cleanup must
    // have disconnected the prior observer.
    disconnected = false;
    rerender({ pages: 5 });
    expect(disconnected).toBe(true);

    // Final unmount must also disconnect.
    disconnected = false;
    unmount();
    expect(disconnected).toBe(true);
  });
});
