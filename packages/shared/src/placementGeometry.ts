/**
 * Displayed-page ↔ PDF user-space conversion.
 *
 * Field fractions in `envelope_fields` are 0–1 of the page **as displayed**:
 * CropBox applied (MediaBox when the page has no CropBox), `/Rotate` applied,
 * origin at the top-left. That is the rectangle pdf.js `getViewport({ scale: 1 })`
 * shows.
 *
 * PDF user space is not rotated by the viewer: origin at the bottom-left of the coordinate
 * system, y up. `/Rotate` is clockwise and is applied by the viewer. pdf-lib
 * draws in user space and rotates content counterclockwise around the anchor,
 * so passing `rotate` equal to the page's `/Rotate` makes text and images
 * appear upright on the displayed page.
 *
 * The anchor pdf-lib expects (the pre-rotation bottom-left) is the displayed
 * field's bottom-left corner, converted into user space.
 */

export type PageRotation = 0 | 90 | 180 | 270;

/** Axis-aligned rectangle in PDF user space. `x`/`y` is the lower-left corner. */
export interface PdfUserRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The page rectangle viewers clip to, plus `/Rotate`.
 * `box` is the CropBox, or the MediaBox when no CropBox is set.
 */
export interface PageGeometry {
  readonly box: PdfUserRect;
  readonly rotation: PageRotation;
}

/** Fractions of the displayed page. Origin is the top-left. */
export interface DisplayedFractionBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Point in displayed-page points. Origin is the top-left, y grows downward. */
export interface DisplayedPoint {
  readonly x: number;
  readonly y: number;
}

export interface PdfUserPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where to pass a box to pdf-lib so it occupies `box` on the displayed page
 * and reads upright. `rotate` is counterclockwise degrees.
 */
export interface PdfDrawPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotate: PageRotation;
}

const FIELD_PLACEMENT_EPS = 1e-9;

export const FIELD_PLACEMENT_ERRORS = {
  xOutOfRange: 'field_x_out_of_range',
  yOutOfRange: 'field_y_out_of_range',
  widthOutOfRange: 'field_width_out_of_range',
  heightOutOfRange: 'field_height_out_of_range',
  exceedsPage: 'field_exceeds_page',
  pageOutOfRange: 'field_page_out_of_range',
} as const;

export type FieldPlacementErrorCode =
  (typeof FIELD_PLACEMENT_ERRORS)[keyof typeof FIELD_PLACEMENT_ERRORS];

export interface FieldPlacementCheck {
  readonly x: number;
  readonly y: number;
  readonly page: number;
  readonly width?: number | null;
  readonly height?: number | null;
}

/** Normalize a PDF `/Rotate` value into the four viewer-legal quadrants. */
export function normalizePageRotation(angle: number): PageRotation {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((Math.round(angle) % 360) + 360) % 360;
  if (wrapped === 90 || wrapped === 180 || wrapped === 270) return wrapped;
  return 0;
}

/** Width and height of the page as displayed (CropBox with `/Rotate` applied). */
export function displayedPageSize(geometry: PageGeometry): { width: number; height: number } {
  const swap = geometry.rotation === 90 || geometry.rotation === 270;
  return swap
    ? { width: geometry.box.height, height: geometry.box.width }
    : { width: geometry.box.width, height: geometry.box.height };
}

/**
 * Map a point on the displayed page (points, top-left origin, y down) into
 * PDF user space. Matches pdf.js `viewport.convertToPdfPoint`.
 */
export function displayedPointToPdf(
  geometry: PageGeometry,
  displayedX: number,
  displayedY: number,
): PdfUserPoint {
  const { x: x0, y: y0, width, height } = geometry.box;
  const x1 = x0 + width;
  const y1 = y0 + height;
  switch (geometry.rotation) {
    case 0:
      return { x: x0 + displayedX, y: y1 - displayedY };
    case 90:
      return { x: x0 + displayedY, y: y0 + displayedX };
    case 180:
      return { x: x1 - displayedX, y: y0 + displayedY };
    case 270:
      return { x: x1 - displayedY, y: y1 - displayedX };
    default: {
      const _exhaustive: never = geometry.rotation;
      return _exhaustive;
    }
  }
}

/** Inverse of {@link displayedPointToPdf}. */
export function pdfPointToDisplayed(
  geometry: PageGeometry,
  pdfX: number,
  pdfY: number,
): DisplayedPoint {
  const { x: x0, y: y0, width, height } = geometry.box;
  const x1 = x0 + width;
  const y1 = y0 + height;
  switch (geometry.rotation) {
    case 0:
      return { x: pdfX - x0, y: y1 - pdfY };
    case 90:
      return { x: pdfY - y0, y: pdfX - x0 };
    case 180:
      return { x: x1 - pdfX, y: pdfY - y0 };
    case 270:
      return { x: y1 - pdfY, y: x1 - pdfX };
    default: {
      const _exhaustive: never = geometry.rotation;
      return _exhaustive;
    }
  }
}

/**
 * Convert a displayed-page fraction box into the pdf-lib draw anchor.
 * Width and height are in PDF points along the glyph/image axes before `rotate`
 * (the viewer rotation is cancelled by `rotate`).
 */
export function displayedBoxToPdfDraw(
  geometry: PageGeometry,
  box: DisplayedFractionBox,
): PdfDrawPlacement {
  const size = displayedPageSize(geometry);
  const left = box.x * size.width;
  const top = box.y * size.height;
  const width = box.width * size.width;
  const height = box.height * size.height;
  const anchor = displayedPointToPdf(geometry, left, top + height);
  return { x: anchor.x, y: anchor.y, width, height, rotate: geometry.rotation };
}

/** Axis-aligned box in PDF user space. Lower-left origin. */
export interface PdfAxisBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Page geometry persisted on `envelopes.original_page_geometry` at upload.
 * `view_width` / `view_height` are the displayed page (CropBox, else MediaBox,
 * with `/Rotate` applied) in PDF points. `page` is 1-based.
 */
export interface StoredPageGeometry {
  readonly page: number;
  readonly view_width: number;
  readonly view_height: number;
  readonly rotation: PageRotation;
  readonly mediabox: PdfAxisBox;
  readonly cropbox: PdfAxisBox;
}

/** Build one persisted page record from the boxes pdf-lib reports. */
export function storedPageGeometry(input: {
  readonly page: number;
  readonly rotation: number;
  readonly mediabox: PdfAxisBox;
  readonly cropbox: PdfAxisBox;
}): StoredPageGeometry {
  const rotation = normalizePageRotation(input.rotation);
  const size = displayedPageSize({ box: input.cropbox, rotation });
  return {
    page: input.page,
    view_width: size.width,
    view_height: size.height,
    rotation,
    mediabox: input.mediabox,
    cropbox: input.cropbox,
  };
}

function unitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Reject a field the seal would otherwise drop or draw off the displayed page.
 * `pageCount` is the document's page count; pass null when it is not known yet
 * (no file uploaded) and the page-count check is skipped.
 * Returns null when the placement is valid.
 */
export function fieldPlacementError(
  field: FieldPlacementCheck,
  pageCount: number | null,
): FieldPlacementErrorCode | null {
  if (!unitInterval(field.x)) return FIELD_PLACEMENT_ERRORS.xOutOfRange;
  if (!unitInterval(field.y)) return FIELD_PLACEMENT_ERRORS.yOutOfRange;
  if (field.width != null && !unitInterval(field.width)) {
    return FIELD_PLACEMENT_ERRORS.widthOutOfRange;
  }
  if (field.height != null && !unitInterval(field.height)) {
    return FIELD_PLACEMENT_ERRORS.heightOutOfRange;
  }
  if (field.width != null && field.x + field.width > 1 + FIELD_PLACEMENT_EPS) {
    return FIELD_PLACEMENT_ERRORS.exceedsPage;
  }
  if (field.height != null && field.y + field.height > 1 + FIELD_PLACEMENT_EPS) {
    return FIELD_PLACEMENT_ERRORS.exceedsPage;
  }
  if (!Number.isInteger(field.page) || field.page < 1) {
    return FIELD_PLACEMENT_ERRORS.pageOutOfRange;
  }
  if (pageCount != null && field.page > pageCount) {
    return FIELD_PLACEMENT_ERRORS.pageOutOfRange;
  }
  return null;
}
