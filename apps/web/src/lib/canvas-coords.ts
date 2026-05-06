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
