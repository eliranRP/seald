/**
 * Pure field-rendering logic extracted from SealingService so it can be
 * tested independently (calibration grid) and reused by the service.
 *
 * No Nest dependencies — takes a pdf-lib page + fonts + optional images.
 *
 * Stored fractions are of the page as displayed (CropBox + /Rotate, top-left
 * origin). Drawing goes through `displayedBoxToPdfDraw` so the mark lands in
 * that rectangle and reads upright.
 */
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { degrees, rgb } from 'pdf-lib';
import {
  displayedBoxToPdfDraw,
  displayedPageSize,
  displayedPointToPdf,
  type PageGeometry,
} from 'shared';
import { pageGeometryOf } from './page-geometry';

export interface BurnInField {
  kind: string;
  x: number; // normalized 0-1, displayed page, top-left
  y: number; // normalized 0-1, displayed page, top-left
  width?: number | null | undefined;
  height?: number | null | undefined;
  value_text?: string | null | undefined;
  value_boolean?: boolean | null | undefined;
}

export interface BurnInAssets {
  sigImg: PDFImage | null;
  initialsImg: PDFImage | null;
  helvetica: PDFFont;
  helveticaBold: PDFFont;
}

/** pdf-lib expects signatures ~25% page width if no explicit width. */
export function defaultWidth(kind: string): number {
  if (kind === 'signature') return 0.25;
  if (kind === 'initials') return 0.08;
  if (kind === 'checkbox') return 0.03;
  return 0.2;
}

export function defaultHeight(kind: string): number {
  if (kind === 'signature') return 0.06;
  if (kind === 'initials') return 0.04;
  if (kind === 'checkbox') return 0.03;
  return 0.03;
}

/** Left inset of burned text, matching the signing screen's field padding. */
const TEXT_INSET_PT = 22;
const TEXT_SIZE_PT = 12;

/** 1 = MediaBox seal. 2 = displayed page (CropBox + /Rotate). */
export type PlacementVersion = 1 | 2;

/**
 * Render a single field onto a PDF page. Version 2 is the displayed-page
 * seal. Version 1 is the MediaBox seal kept for envelopes that were
 * prepared before that math, so re-sealing them does not move fields.
 * Callers that omit the version get version 2 (new drafts). The sealing
 * service always passes the envelope's `placement_version`.
 */
export function burnInField(
  page: PDFPage,
  f: BurnInField,
  assets: BurnInAssets,
  placementVersion: PlacementVersion = 2,
): void {
  if (placementVersion === 1) {
    burnInFieldLegacy(page, f, assets);
    return;
  }
  burnInFieldDisplayed(page, f, assets);
}

/**
 * MediaBox seal: `getWidth`/`getHeight`, no page rotation, checkbox mark
 * fixed at 10pt and shifted 22pt to the right of the field box.
 */
function burnInFieldLegacy(page: PDFPage, f: BurnInField, assets: BurnInAssets): void {
  const pw = page.getWidth();
  const ph = page.getHeight();
  const w = (f.width ?? defaultWidth(f.kind)) * pw;
  const h = (f.height ?? defaultHeight(f.kind)) * ph;
  const cx = f.x * pw + w / 2;
  const cy = ph - f.y * ph - h / 2;

  if (f.kind === 'signature') {
    if (assets.sigImg) {
      page.drawImage(assets.sigImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    }
  } else if (f.kind === 'initials') {
    if (assets.initialsImg) {
      page.drawImage(assets.initialsImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
    }
  } else if (f.kind === 'checkbox') {
    const cbSize = 10;
    const cbX = cx - w / 2 + 22;
    const cbY = cy - cbSize / 2;
    page.drawRectangle({
      x: cbX,
      y: cbY,
      width: cbSize,
      height: cbSize,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    if (f.value_boolean === true) {
      const inset = cbSize * 0.15;
      const iw = cbSize - inset * 2;
      const ih = cbSize - inset * 2;
      const left = cbX + inset;
      const bottom = cbY + inset;
      const stroke = 1.2;
      page.drawLine({
        start: { x: left, y: bottom + ih * 0.6 },
        end: { x: left + iw * 0.4, y: bottom + ih * 0.15 },
        thickness: stroke,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: left + iw * 0.4, y: bottom + ih * 0.15 },
        end: { x: left + iw, y: bottom + ih * 0.95 },
        thickness: stroke,
        color: rgb(0, 0, 0),
      });
    }
  } else {
    const text = f.value_text ?? '';
    const fontSize = 12;
    const textHeight = assets.helvetica.heightAtSize(fontSize);
    page.drawText(text, {
      x: cx - w / 2 + 22,
      y: cy - textHeight / 2,
      size: fontSize,
      font: assets.helvetica,
      color: rgb(0, 0, 0),
    });
  }
}

function burnInFieldDisplayed(page: PDFPage, f: BurnInField, assets: BurnInAssets): void {
  const geometry = pageGeometryOf(page);
  const widthFrac = f.width ?? defaultWidth(f.kind);
  const heightFrac = f.height ?? defaultHeight(f.kind);
  const placement = displayedBoxToPdfDraw(geometry, {
    x: f.x,
    y: f.y,
    width: widthFrac,
    height: heightFrac,
  });
  const rotate = degrees(placement.rotate);

  if (f.kind === 'signature') {
    if (assets.sigImg) {
      page.drawImage(assets.sigImg, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotate,
      });
    }
  } else if (f.kind === 'initials') {
    if (assets.initialsImg) {
      page.drawImage(assets.initialsImg, {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rotate,
      });
    }
  } else if (f.kind === 'checkbox') {
    const edge = Math.min(placement.width, placement.height);
    page.drawRectangle({
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      borderColor: rgb(0, 0, 0),
      borderWidth: Math.min(1.5, Math.max(0.5, edge * 0.05)),
      rotate,
    });
    if (f.value_boolean === true) {
      drawCheckmark(page, geometry, f.x, f.y, widthFrac, heightFrac);
    }
  } else {
    const text = f.value_text ?? '';
    const textHeight = assets.helvetica.heightAtSize(TEXT_SIZE_PT);
    const size = displayedPageSize(geometry);
    const left = f.x * size.width;
    const top = f.y * size.height;
    const boxHeight = heightFrac * size.height;
    const baseline = displayedPointToPdf(
      geometry,
      left + TEXT_INSET_PT,
      top + boxHeight / 2 + textHeight / 2,
    );
    page.drawText(text, {
      x: baseline.x,
      y: baseline.y,
      size: TEXT_SIZE_PT,
      font: assets.helvetica,
      color: rgb(0, 0, 0),
      rotate,
    });
  }
}

/**
 * Checkmark centered in the field box. Endpoints are expressed in displayed
 * points (y down) and converted, so the stroke stays upright on a rotated page
 * without a separate text-style rotation.
 */
function drawCheckmark(
  page: PDFPage,
  geometry: PageGeometry,
  xFrac: number,
  yFrac: number,
  widthFrac: number,
  heightFrac: number,
): void {
  const size = displayedPageSize(geometry);
  const left = xFrac * size.width;
  const top = yFrac * size.height;
  const fw = widthFrac * size.width;
  const fh = heightFrac * size.height;
  const insetX = fw * 0.15;
  const insetY = fh * 0.15;
  const iw = fw - insetX * 2;
  const ih = fh - insetY * 2;
  const x0 = left + insetX;
  const toDisplayedY = (yUpFromBottom: number): number => top + fh - yUpFromBottom;
  const start = displayedPointToPdf(geometry, x0, toDisplayedY(insetY + ih * 0.6));
  const mid = displayedPointToPdf(geometry, x0 + iw * 0.4, toDisplayedY(insetY + ih * 0.15));
  const end = displayedPointToPdf(geometry, x0 + iw, toDisplayedY(insetY + ih * 0.95));
  const stroke = Math.max(0.75, Math.min(fw, fh) * 0.12);
  page.drawLine({
    start,
    end: mid,
    thickness: stroke,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: mid,
    end,
    thickness: stroke,
    color: rgb(0, 0, 0),
  });
}
