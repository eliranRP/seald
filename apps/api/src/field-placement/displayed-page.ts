/**
 * SWAP POINT for Insert C.
 *
 * Insert C will export one displayed-page ↔ PDF-space helper and correct
 * seal placement for rotation, CropBox, mixed page sizes, and the
 * checkbox. Replace `displayedPointToPdf` and `pdfPointToDisplayed`
 * with that export. Nothing else in this module may convert between
 * displayed points and PDF user space.
 *
 * Until that lands, both functions use the pdf.js viewport at scale 1.
 * That is the page the web editor measures (`getViewport({ scale: 1 })`):
 * CropBox with /Rotate applied, origin at the top-left, y down, units
 * in PDF points.
 *
 * Fractions stored on envelope_fields go through `normalizeRect` /
 * `denormalizeRect` in `envelopes/coord.ts` — the same helpers the API
 * uses for the numeric(7,4) column. The editor's `normalizeCoord` is
 * that ratio against the canvas; the canvas is a uniform scale of this
 * displayed page, so the fraction is identical.
 */
import { denormalizeRect, normalizeRect, type NormalizedRect } from '../envelopes/coord';
import { FieldPlacementError } from './field-placement.errors';
import type { DisplayedBox } from './field-placement.types';

export interface PdfViewport {
  readonly width: number;
  readonly height: number;
  convertToPdfPoint(x: number, y: number): readonly number[];
  convertToViewportPoint(x: number, y: number): readonly number[];
}

export interface PdfPoint {
  readonly x: number;
  readonly y: number;
}

export interface PdfRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function component(transform: readonly number[], index: number): number {
  const value = transform[index];
  return value === undefined || !Number.isFinite(value) ? 0 : value;
}

function applyTransform(
  transform: readonly number[],
  x: number,
  y: number,
): readonly [number, number] {
  const a = component(transform, 0);
  const b = component(transform, 1);
  const c = component(transform, 2);
  const d = component(transform, 3);
  const e = component(transform, 4);
  const f = component(transform, 5);
  return [a * x + c * y + e, b * x + d * y + f];
}

function invertTransform(transform: readonly number[]): readonly number[] {
  const a = component(transform, 0);
  const b = component(transform, 1);
  const c = component(transform, 2);
  const d = component(transform, 3);
  const e = component(transform, 4);
  const f = component(transform, 5);
  const det = a * d - c * b;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    throw new FieldPlacementError('invalid_pdf', 'page transform is not invertible');
  }
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/**
 * Viewport rebuilt from pdf.js `getViewport({ scale: 1 }).transform`.
 * The live pdf.js page stays in the worker; this is the same matrix.
 */
export function viewportFromTransform(
  width: number,
  height: number,
  transform: readonly number[],
): PdfViewport {
  const inverse = invertTransform(transform);
  return {
    width,
    height,
    convertToViewportPoint(x: number, y: number): readonly number[] {
      return applyTransform(transform, x, y);
    },
    convertToPdfPoint(x: number, y: number): readonly number[] {
      return applyTransform(inverse, x, y);
    },
  };
}

function pair(values: readonly number[], what: string): PdfPoint {
  const x = values[0];
  const y = values[1];
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new FieldPlacementError('invalid_pdf', `${what} did not return a point`);
  }
  return { x, y };
}

export function displayedPointToPdf(viewport: PdfViewport, point: PdfPoint): PdfPoint {
  return pair(viewport.convertToPdfPoint(point.x, point.y), 'convertToPdfPoint');
}

export function pdfPointToDisplayed(viewport: PdfViewport, point: PdfPoint): PdfPoint {
  return pair(viewport.convertToViewportPoint(point.x, point.y), 'convertToViewportPoint');
}

/**
 * Axis-aligned PDF user-space rectangle (lower-left origin, positive
 * width and height) covering a displayed-page box.
 */
export function displayedBoxToPdfRect(viewport: PdfViewport, box: DisplayedBox): PdfRect {
  const corners = [
    displayedPointToPdf(viewport, { x: box.x, y: box.y }),
    displayedPointToPdf(viewport, { x: box.x + box.w, y: box.y }),
    displayedPointToPdf(viewport, { x: box.x, y: box.y + box.h }),
    displayedPointToPdf(viewport, { x: box.x + box.w, y: box.y + box.h }),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function displayedBoxFromPdfRect(viewport: PdfViewport, rect: PdfRect): DisplayedBox {
  const corners = [
    pdfPointToDisplayed(viewport, { x: rect.x, y: rect.y }),
    pdfPointToDisplayed(viewport, { x: rect.x + rect.width, y: rect.y }),
    pdfPointToDisplayed(viewport, { x: rect.x, y: rect.y + rect.height }),
    pdfPointToDisplayed(viewport, { x: rect.x + rect.width, y: rect.y + rect.height }),
  ];
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function displayedBoxToStored(
  box: DisplayedBox,
  page: { readonly width: number; readonly height: number },
): NormalizedRect {
  return normalizeRect({ x: box.x, y: box.y, width: box.w, height: box.h }, page);
}

export function storedBoxToDisplayed(
  field: {
    readonly x: number;
    readonly y: number;
    readonly width: number | null;
    readonly height: number | null;
  },
  page: { readonly width: number; readonly height: number },
): DisplayedBox {
  const pixel = denormalizeRect(
    { x: field.x, y: field.y, width: field.width, height: field.height },
    page,
  );
  return {
    x: pixel.x,
    y: pixel.y,
    w: pixel.width ?? 0,
    h: pixel.height ?? 0,
  };
}
