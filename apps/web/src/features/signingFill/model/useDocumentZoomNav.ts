import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Zoom + page-rail nav state for the signing & sender prep canvases.
 *
 * Owns three concerns the page used to inline:
 *  - clamped zoom level (25% steps, 0.5–2.0 range — Acrobat/Preview parity)
 *  - smooth scroll-to-page by `data-r-page` selector
 *  - top-most-visible page tracking via IntersectionObserver (survives zoom)
 *
 * Returns a ref to attach to the scrollable area plus the derived state +
 * handlers. The page renders the JSX; this hook owns the lifecycle.
 */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.25;
export const ZOOM_DEFAULT = 1;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

interface UseDocumentZoomNavArgs {
  readonly totalPages: number;
  // Reattach the IntersectionObserver when the underlying page DOM changes
  // (for the signing flow: when the signed PDF URL resolves).
  readonly resetKey?: unknown;
}

interface UseDocumentZoomNavReturn {
  readonly scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  readonly zoom: number;
  readonly currentPage: number;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly scrollToPage: (pageNum: number) => void;
  readonly zoomInDisabled: boolean;
  readonly zoomOutDisabled: boolean;
}

export function useDocumentZoomNav({
  totalPages,
  resetKey,
}: UseDocumentZoomNavArgs): UseDocumentZoomNavReturn {
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(ZOOM_DEFAULT), []);

  const scrollToPage = useCallback((pageNum: number): void => {
    const el = document.querySelector<HTMLElement>(`[data-r-page="${pageNum}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Track the top-most visible page so external rail UIs can highlight it.
  // Uses IntersectionObserver rather than scroll math so it survives zoom.
  useEffect(() => {
    const scrollRoot = scrollAreaRef.current;
    if (!scrollRoot) return undefined;
    const nodes = scrollRoot.querySelectorAll<HTMLElement>('[data-r-page]');
    if (nodes.length === 0) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the highest intersection ratio — that's the
        // one the user is looking at right now.
        let best: { page: number; ratio: number } | null = null;
        for (const e of entries) {
          if (e.isIntersecting) {
            const p = Number(e.target.getAttribute('data-r-page'));
            if (p && (!best || e.intersectionRatio > best.ratio)) {
              best = { page: p, ratio: e.intersectionRatio };
            }
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root: scrollRoot, threshold: [0.25, 0.5, 0.75] },
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [totalPages, resetKey]);

  return {
    scrollAreaRef,
    zoom,
    currentPage,
    zoomIn,
    zoomOut,
    resetZoom,
    scrollToPage,
    zoomInDisabled: zoom >= ZOOM_MAX - 1e-6,
    zoomOutDisabled: zoom <= ZOOM_MIN + 1e-6,
  };
}
