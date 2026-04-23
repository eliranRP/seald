/**
 * Coordinate helpers.
 *
 * Wire format: normalized [0,1] top-left-origin, fractions of the PDF page's
 * actual rendered dimensions. Stored as `numeric(7,4)` in Postgres, so the
 * wire transport carries at most 4 decimals of precision (enough for sub-pixel
 * accuracy on a 10000-wide page).
 *
 * The seal-time y-flip (top-left → bottom-left for pdf-lib) happens in the
 * worker, not here. These helpers only normalize and clamp.
 */

export interface PageDimensions {
  readonly width: number; // px, > 0
  readonly height: number; // px, > 0
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * Round to 4 decimals. Avoids storing 0.123456789 when the DB column is
 * numeric(7,4) — Postgres would round silently, but let's be explicit.
 */
export function roundCoord(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Clamp to [0, 1] inclusive. */
export function clampUnit(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Normalize a pixel rectangle against a page. Throws if page dimensions are
 * invalid (<=0). Output is clamped to [0,1] and rounded to 4 decimals.
 */
export function normalizeRect(rect: PixelRect, page: PageDimensions): NormalizedRect {
  if (!(page.width > 0) || !(page.height > 0)) {
    throw new Error(`invalid_page_dimensions: ${page.width}x${page.height}`);
  }
  return {
    x: roundCoord(clampUnit(rect.x / page.width)),
    y: roundCoord(clampUnit(rect.y / page.height)),
    width: rect.width == null ? null : roundCoord(clampUnit(rect.width / page.width)),
    height: rect.height == null ? null : roundCoord(clampUnit(rect.height / page.height)),
  };
}

/** Inverse: scale normalized coords back into pixel space for rehydration in the editor. */
export function denormalizeRect(rect: NormalizedRect, page: PageDimensions): PixelRect {
  if (!(page.width > 0) || !(page.height > 0)) {
    throw new Error(`invalid_page_dimensions: ${page.width}x${page.height}`);
  }
  return {
    x: rect.x * page.width,
    y: rect.y * page.height,
    width: rect.width == null ? null : rect.width * page.width,
    height: rect.height == null ? null : rect.height * page.height,
  };
}

/**
 * Flip normalized y for PDF-native bottom-left origin. Used by the worker at
 * seal time.
 *
 *   norm_y (top-left) = y_tl / page_h
 *   pdf-lib y (bottom-left) = page_h - y_tl - height = page_h * (1 - y_tl/page_h - h/page_h)
 *                                                    = page_h * (1 - norm_y - norm_h)
 *
 * Returns the pdf-lib y in PIXEL space so you can pass it straight to
 * drawImage({ x, y }) after multiplying the normalized x by page_w.
 */
export function flipYForPdfLib(norm_y: number, norm_h: number | null, page_h: number): number {
  const h = norm_h ?? 0;
  return page_h * (1 - norm_y - h);
}
