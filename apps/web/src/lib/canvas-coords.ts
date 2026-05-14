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
 * Compute the actual canvas height from the PDF's first page.
 * Returns CANVAS_HEIGHT_FALLBACK until the PDF is loaded.
 */
export function useCanvasHeight(pdfDoc: PDFDocumentProxy | null | undefined): number {
  const [height, setHeight] = useState(CANVAS_HEIGHT_FALLBACK);

  useEffect(() => {
    if (!pdfDoc) return;
    void pdfDoc.getPage(1).then((page) => {
      const vp = page.getViewport({ scale: 1 });
      setHeight(CANVAS_WIDTH * (vp.height / vp.width));
    });
  }, [pdfDoc]);

  return height;
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
 */
export function denormalizeCoord(norm: number, canvasPx: number): number {
  return norm > 1 ? norm : Math.round(norm * canvasPx);
}
