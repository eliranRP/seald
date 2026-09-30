/**
 * Shared canvas coordinate constants and helpers.
 *
 * The editor canvas is fixed-width; field pixel coords are stored
 * relative to this size. The canvas HEIGHT depends on the PDF's
 * aspect ratio (CANVAS_WIDTH * pageH / pageW). The fallback is
 * used when no PDF is loaded (placeholder mode).
 */
import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Fixed canvas width — all surfaces (editor, signing, template) use this. */
export const CANVAS_WIDTH = 560;

/** Fallback canvas height when the PDF hasn't loaded yet. */
export const CANVAS_HEIGHT_FALLBACK = 740;

/** Horizontal gutter we leave around the canvas on small viewports (16 px each side). */
export const MOBILE_CANVAS_GUTTER = 32;

/** Below this viewport width the canvas shrinks to `viewport - MOBILE_CANVAS_GUTTER`. */
export const MOBILE_CANVAS_BREAKPOINT = 768;

/**
 * Compute the canvas width to render at a given viewport width.
 *
 * Desktop (`viewportWidth > MOBILE_CANVAS_BREAKPOINT`) keeps the historical
 * 560 px so field coordinates stored against that grid keep rendering
 * pixel-for-pixel. Mobile shrinks to `viewportWidth - MOBILE_CANVAS_GUTTER`
 * so no field at `x > viewportWidth` is hidden off-screen and the user
 * doesn't need a two-finger pan to reach the right-hand fields
 * (audit report-B-signer.md, SigningFillPage [HIGH] mobile canvas overflow).
 *
 * Returned value is always positive and never exceeds `CANVAS_WIDTH`.
 */
export function computeCanvasWidth(viewportWidth: number): number {
  if (viewportWidth > MOBILE_CANVAS_BREAKPOINT) return CANVAS_WIDTH;
  const target = Math.max(1, viewportWidth - MOBILE_CANVAS_GUTTER);
  return Math.min(CANVAS_WIDTH, target);
}

/**
 * React-friendly hook that tracks the live viewport width and returns
 * the current canvas render width. Updates on window resize.
 *
 * Returns `CANVAS_WIDTH` during server-render (no window) so SSR / test
 * environments without a defined `innerWidth` get the desktop layout.
 */
export function useCanvasWidth(): number {
  const initial =
    typeof window === 'undefined' ? CANVAS_WIDTH : computeCanvasWidth(window.innerWidth);
  const [width, setWidth] = useState<number>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onResize(): void {
      setWidth(computeCanvasWidth(window.innerWidth));
    }
    window.addEventListener('resize', onResize);
    // Sync once on mount in case the initial render captured a stale
    // value (e.g. a test that mutates `innerWidth` between import and
    // mount).
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

/**
 * CSS height for one page rendered at `canvasWidth`, from that page's own
 * displayed viewport (CropBox and /Rotate already applied by pdf.js).
 */
export function pageCanvasHeight(
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
): number {
  if (!(viewportWidth > 0) || !(canvasWidth > 0)) return CANVAS_HEIGHT_FALLBACK;
  return (canvasWidth * viewportHeight) / viewportWidth;
}

/**
 * Per-page canvas heights. Page 1's aspect ratio must not be reused for
 * later pages — a Legal page after Letter is ~200px taller at 560px wide.
 * Returns an empty map until the document's viewports have loaded.
 */
export function usePageCanvasHeights(
  pdfDoc: PDFDocumentProxy | null | undefined,
  canvasWidth: number,
): ReadonlyMap<number, number> {
  const [heights, setHeights] = useState<ReadonlyMap<number, number>>(() => new Map());

  useEffect(() => {
    if (!pdfDoc) {
      setHeights(new Map());
      return undefined;
    }
    let cancelled = false;
    const count = pdfDoc.numPages;
    void Promise.all(
      Array.from({ length: count }, (_, index) => {
        const pageNumber = index + 1;
        return pdfDoc.getPage(pageNumber).then((page) => {
          const viewport = page.getViewport({ scale: 1 });
          return [
            pageNumber,
            pageCanvasHeight(viewport.width, viewport.height, canvasWidth),
          ] as const;
        });
      }),
    ).then((entries) => {
      if (!cancelled) setHeights(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, canvasWidth]);

  return heights;
}

/**
 * Compute the actual canvas height from the PDF's first page.
 * Returns CANVAS_HEIGHT_FALLBACK until the PDF is loaded.
 */
export function useCanvasHeight(pdfDoc: PDFDocumentProxy | null | undefined): number {
  const heights = usePageCanvasHeights(pdfDoc, CANVAS_WIDTH);
  return heights.get(1) ?? CANVAS_HEIGHT_FALLBACK;
}

/**
 * Convert a field's pixel coords to normalized 0-1 fractions.
 * Used when sending fields to the API.
 */
export function normalizeCoord(px: number, canvasPx: number): number {
  return Math.max(0, Math.min(1, px / canvasPx));
}

/**
 * Convert a normalized 0-1 fraction back to pixel coords.
 * Used when rendering fields on the signing surface.
 * Handles legacy fields that may already be in pixel coords (> 1).
 *
 * `round: false` keeps the fraction exact (signing screen). The default
 * still snaps to whole pixels for callers that stored integer CSS coords.
 */
export function denormalizeCoord(
  norm: number,
  canvasPx: number,
  options?: { readonly round?: boolean },
): number {
  if (norm > 1) return norm;
  const px = norm * canvasPx;
  if (options?.round === false) return px;
  return Math.round(px);
}

/**
 * Pixel box for a stored field on one page's canvas. Width and height fall
 * back to the caller's pixel defaults when the field has no explicit size.
 * Positions are not rounded — a fraction of a tall page must not snap to a
 * whole pixel of page 1's aspect ratio.
 */
export function placeSignerField(
  field: {
    readonly x: number;
    readonly y: number;
    readonly width?: number | null;
    readonly height?: number | null;
  },
  defaults: { readonly w: number; readonly h: number },
  pageWidth: number,
  pageHeight: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  return {
    x: denormalizeCoord(field.x, pageWidth, { round: false }),
    y: denormalizeCoord(field.y, pageHeight, { round: false }),
    w: field.width ? denormalizeCoord(field.width, pageWidth, { round: false }) : defaults.w,
    h: field.height ? denormalizeCoord(field.height, pageHeight, { round: false }) : defaults.h,
  };
}
