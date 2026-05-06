/**
 * Pure field-rendering logic extracted from SealingService so it can be
 * tested independently (calibration grid) and reused by the service.
 *
 * No Nest dependencies — takes a pdf-lib page + fonts + optional images.
 */
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';

export interface BurnInField {
  kind: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1, from top
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

/**
 * Render a single field onto a PDF page — the EXACT logic that produces
 * the sealed PDF. Both the sealing service and calibration tests call
 * this function so they can never diverge.
 *
 * Content is centered within the field box on both axes.
 */
export function burnInField(page: PDFPage, f: BurnInField, assets: BurnInAssets): void {
  const pw = page.getWidth();
  const ph = page.getHeight();
  const w = (f.width ?? defaultWidth(f.kind)) * pw;
  const h = (f.height ?? defaultHeight(f.kind)) * ph;
  // Stored (x, y) is the top-left of the field tile in web coords.
  // In PDF coords (bottom-left origin) this point is:
  const storedX = f.x * pw;
  const storedY = ph - f.y * ph;
  // Center content on the stored point so the burn-in lands where
  // the user visually placed the field.
  const cx = storedX;
  const cy = storedY;

  if (f.kind === 'signature') {
    if (assets.sigImg)
      page.drawImage(assets.sigImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  } else if (f.kind === 'initials') {
    if (assets.initialsImg)
      page.drawImage(assets.initialsImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  } else if (f.kind === 'checkbox') {
    page.drawRectangle({
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    if (f.value_boolean === true) {
      const bx = cx - w / 2;
      const by = cy - h / 2;
      const inset = Math.min(w, h) * 0.18;
      const innerW = w - inset * 2;
      const innerH = h - inset * 2;
      const left = bx + inset;
      const bottom = by + inset;
      const stroke = Math.max(0.8, Math.min(w, h) * 0.12);
      page.drawLine({
        start: { x: left, y: bottom + innerH * 0.6 },
        end: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
        thickness: stroke,
        color: rgb(0, 0, 0),
      });
      page.drawLine({
        start: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
        end: { x: left + innerW, y: bottom + innerH * 0.95 },
        thickness: stroke,
        color: rgb(0, 0, 0),
      });
    }
  } else {
    // text / date / email
    const text = f.value_text ?? '';
    const fontSize = 12;
    const textWidth = assets.helvetica.widthOfTextAtSize(text, fontSize);
    const textHeight = assets.helvetica.heightAtSize(fontSize);
    page.drawText(text, {
      x: cx - textWidth / 2,
      y: cy - textHeight / 2,
      size: fontSize,
      font: assets.helvetica,
      color: rgb(0, 0, 0),
    });
  }
}
