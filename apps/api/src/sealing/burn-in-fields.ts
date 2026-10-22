/**
 * Pure field-rendering logic extracted from SealingService so it can be
 * tested independently (calibration grid) and reused by the service.
 *
 * No Nest dependencies — takes a pdf-lib page + fonts + optional images.
 */
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { formatNumberValue, NUMBER_FORMATS, type NumberFormat } from 'shared';

export interface BurnInField {
  kind: string;
  x: number; // normalized 0-1
  y: number; // normalized 0-1, from top
  width?: number | null | undefined;
  height?: number | null | undefined;
  value_text?: string | null | undefined;
  value_boolean?: boolean | null | undefined;
  /** WP-07. Per-kind options; absent on legacy fields, which burn in unchanged. */
  meta?: Readonly<Record<string, unknown>> | null | undefined;
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

/** `meta.font_size` when set and in range; the legacy 12pt otherwise. */
function metaFontSize(meta: BurnInField['meta']): number {
  const size = meta?.['font_size'];
  return typeof size === 'number' && size >= 8 && size <= 96 ? size : 12;
}

/** Label of the option whose value is `value`; the value itself if unlisted. */
function optionLabel(meta: BurnInField['meta'], value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const options = meta?.['options'];
  if (Array.isArray(options)) {
    for (const o of options as unknown[]) {
      if (typeof o === 'object' && o !== null) {
        const opt = o as { label?: unknown; value?: unknown };
        if (opt.value === value && typeof opt.label === 'string') return opt.label;
      }
    }
  }
  return value;
}

/** The text a text-like field draws (WP-07: number formatted, dropdown by label). */
function displayText(f: BurnInField): string {
  const text = f.value_text ?? '';
  if (f.kind === 'number') {
    const format = f.meta?.['format'];
    const known =
      typeof format === 'string' && (NUMBER_FORMATS as readonly string[]).includes(format);
    return formatNumberValue(text, known ? (format as NumberFormat) : undefined);
  }
  if (f.kind === 'dropdown') return optionLabel(f.meta, text) ?? '';
  return text;
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
  // Stored (x, y) is the top-left of the field box in web coords.
  // The CENTER of the box is at (x + w/2, y + h/2) from top-left.
  // Convert to PDF coords (bottom-left origin):
  const cx = f.x * pw + w / 2;
  const cy = ph - f.y * ph - h / 2;

  if (f.kind === 'signature') {
    if (assets.sigImg)
      page.drawImage(assets.sigImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  } else if (f.kind === 'initials') {
    if (assets.initialsImg)
      page.drawImage(assets.initialsImg, { x: cx - w / 2, y: cy - h / 2, width: w, height: h });
  } else if (f.kind === 'checkbox') {
    // Render a small fixed-size checkbox (14pt) left-aligned in the field box.
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
  } else if (f.kind === 'radio') {
    // WP-07: one ring, filled when an option is selected, then the chosen
    // option's label. The field box is a single radio group.
    const ringRadius = 5;
    const ringX = cx - w / 2 + 22 + ringRadius;
    const selected = optionLabel(f.meta, f.value_text);
    page.drawCircle({
      x: ringX,
      y: cy,
      size: ringRadius,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    if (selected !== null) {
      page.drawCircle({ x: ringX, y: cy, size: ringRadius * 0.55, color: rgb(0, 0, 0) });
      const fontSize = metaFontSize(f.meta);
      page.drawText(selected, {
        x: ringX + ringRadius + 6,
        y: cy - assets.helvetica.heightAtSize(fontSize) / 2,
        size: fontSize,
        font: assets.helvetica,
        color: rgb(0, 0, 0),
      });
    }
  } else {
    // text / date / email — left-align within the field box to match
    // the signing screen's display (green box with left-aligned text).
    // WP-07 kinds draw as text too: name, number (formatted per
    // meta.format) and dropdown (the selected option's label).
    const text = displayText(f);
    const fontSize = metaFontSize(f.meta);
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
