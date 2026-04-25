import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface UseCanvasScrollArgs {
  readonly initialPage: number;
  readonly totalPages: number;
  // Re-measure the paper size when this identity changes (e.g. a freshly-
  // loaded PDF replaces the placeholder).
  readonly paperResetKey?: unknown;
}

interface PaperSize {
  readonly width: number;
  readonly height: number;
}

interface UseCanvasScrollReturn {
  readonly currentPage: number;
  readonly setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  readonly visiblePages: ReadonlySet<number>;
  readonly paperSize: PaperSize;
  readonly canvasScrollRef: React.RefObject<HTMLDivElement>;
  readonly canvasRefsRef: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  readonly pageWrapRefsRef: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  readonly setCanvasRefForPage: (p: number) => (el: HTMLDivElement | null) => void;
  readonly setPageWrapRefForPage: (p: number) => (el: HTMLDivElement | null) => void;
  readonly scrollToPage: (p: number) => void;
}

/**
 * Continuous-scroll plumbing for the document editor canvas:
 *   - per-page refs for the PDF canvas + outer wrap
 *   - IntersectionObserver that promotes pages into the live render set as
 *     they approach the viewport, and tracks the dominant visible page
 *   - `scrollToPage()` that smooth-scrolls + eagerly marks the target live so
 *     the canvas mounts even when the observer is racing
 *   - paperSize derived from page-1's canvas (all pages share dimensions)
 *     re-measured via ResizeObserver when the underlying PDF swaps in
 */
export function useCanvasScroll({
  initialPage,
  totalPages,
  paperResetKey,
}: UseCanvasScrollArgs): UseCanvasScrollReturn {
  const [currentPage, setCurrentPage] = useState<number>(() =>
    Math.min(Math.max(initialPage, 1), totalPages),
  );

  // When a PDF loads asynchronously, `totalPages` can jump from a stale
  // placeholder (e.g. 1) to the real count. Clamp the current page so an
  // out-of-range value doesn't linger and break navigation.
  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(p, 1), Math.max(1, totalPages)));
  }, [totalPages]);

  const canvasRefsRef = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const pageWrapRefsRef = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);

  const setCanvasRefForPage = useCallback(
    (p: number) =>
      (el: HTMLDivElement | null): void => {
        canvasRefsRef.current.set(p, el);
      },
    [],
  );
  const setPageWrapRefForPage = useCallback(
    (p: number) =>
      (el: HTMLDivElement | null): void => {
        pageWrapRefsRef.current.set(p, el);
      },
    [],
  );

  const [paperSize, setPaperSize] = useState<PaperSize>({ width: 560, height: 740 });
  useLayoutEffect(() => {
    const el = canvasRefsRef.current.get(1);
    if (!el) return undefined;
    setPaperSize({ width: el.offsetWidth, height: el.offsetHeight });
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      setPaperSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [paperResetKey]);

  // Lazy render set — start with page 1 so the initial paint shows something
  // before the observer fires.
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(() => new Set([1]));

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        // Single iteration covers both lazy-rendering and dominant-page updates.
        let bestPage: number | null = null;
        let bestRatio = 0;
        setVisiblePages((prev) => {
          let next: Set<number> | null = null;
          for (const entry of entries) {
            const pageAttr = entry.target.getAttribute('data-page');
            if (pageAttr) {
              const pageNum = Number(pageAttr);
              if (entry.isIntersecting && !prev.has(pageNum)) {
                if (next === null) next = new Set(prev);
                next.add(pageNum);
              }
              if (entry.intersectionRatio > bestRatio) {
                bestRatio = entry.intersectionRatio;
                bestPage = pageNum;
              }
            }
          }
          return next ?? prev;
        });
        if (bestPage !== null && bestRatio > 0) setCurrentPage(bestPage);
      },
      {
        root: scrollEl,
        // 1-viewport buffer so the next page is pre-rendered before the user
        // reaches it.
        rootMargin: '800px 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    pageWrapRefsRef.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [totalPages]);

  const scrollToPage = useCallback((p: number): void => {
    const target = pageWrapRefsRef.current.get(p);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    // Eagerly mark the target visible so its DocumentCanvas mounts even when
    // the IntersectionObserver doesn't fire (jsdom/tests, smooth-scroll races).
    setVisiblePages((prev) => {
      if (prev.has(p)) return prev;
      const next = new Set(prev);
      next.add(p);
      return next;
    });
    setCurrentPage(p);
  }, []);

  return {
    currentPage,
    setCurrentPage,
    visiblePages,
    paperSize,
    canvasScrollRef,
    canvasRefsRef,
    pageWrapRefsRef,
    setCanvasRefForPage,
    setPageWrapRefForPage,
    scrollToPage,
  };
}
