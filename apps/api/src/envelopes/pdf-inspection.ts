import { createHash } from 'node:crypto';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFArray, PDFDocument, PDFName, PDFNumber, type PDFPage } from 'pdf-lib';

/** 25 MB. Matches the upload route and `GDRIVE_CONVERSION_MAX_BYTES`. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/**
 * Placement refuses a PDF above this page count. Upload does not pass
 * the option, so a web upload over this size still succeeds.
 */
export const MAX_PDF_PAGES = 100;

export interface InspectPdfOptions {
  /** When set, more pages than this is `file_too_many_pages`. */
  readonly maxPages?: number;
}

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export interface PdfPageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One page from the single pdf-lib parse. Boxes are raw PDF user space. */
export interface InspectedPdfPage {
  readonly page: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mediaBox: PdfPageBox;
  readonly cropBox: PdfPageBox;
}

export interface InspectedPdf {
  readonly pages: number;
  readonly sha256: string;
  readonly pageBoxes: readonly InspectedPdfPage[];
}

/**
 * US Letter at the origin. The viewer uses this when a page has no
 * usable MediaBox.
 */
export const DEFAULT_MEDIA_BOX: PdfPageBox = {
  x: 0,
  y: 0,
  width: 612,
  height: 792,
};

const MEDIA_BOX_NAME = PDFName.of('MediaBox');
const CROP_BOX_NAME = PDFName.of('CropBox');

export function normalizePdfRotation(angle: number): 0 | 90 | 180 | 270 {
  const turns = ((Math.round(angle) % 360) + 360) % 360;
  if (turns === 90 || turns === 180 || turns === 270) return turns;
  return 0;
}

/**
 * Four finite numbers, corners ordered so x/y is the minimum and the
 * size is positive. Anything else is unusable, matching the viewer's
 * bounding-box lookup.
 */
function finiteRect(values: readonly number[]): PdfPageBox | null {
  if (values.length !== 4) return null;
  const x1 = values[0];
  const y1 = values[1];
  const x2 = values[2];
  const y2 = values[3];
  if (
    x1 === undefined ||
    y1 === undefined ||
    x2 === undefined ||
    y2 === undefined ||
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return null;
  }
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const width = Math.max(x1, x2) - x;
  const height = Math.max(y1, y2) - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Inherited box, or null when the entry is missing or malformed. */
function readRect(page: PDFPage, name: PDFName): PdfPageBox | null {
  try {
    const raw = page.node.getInheritableAttribute(name);
    if (raw === undefined) return null;
    const array = page.node.context.lookup(raw, PDFArray);
    const values: number[] = [];
    for (let i = 0; i < array.size(); i += 1) {
      values.push(array.lookup(i, PDFNumber).asNumber());
    }
    return finiteRect(values);
  } catch {
    return null;
  }
}

/**
 * Intersection of two positive boxes. An empty intersection is null so
 * the caller can keep the MediaBox, which is what the viewer displays.
 */
function clipToMedia(crop: PdfPageBox, media: PdfPageBox): PdfPageBox | null {
  const x = Math.max(crop.x, media.x);
  const y = Math.max(crop.y, media.y);
  const right = Math.min(crop.x + crop.width, media.x + media.width);
  const top = Math.min(crop.y + crop.height, media.y + media.height);
  if (right - x <= 0 || top - y <= 0) return null;
  return { x, y, width: right - x, height: top - y };
}

function pageRotation(page: PDFPage): 0 | 90 | 180 | 270 {
  try {
    return normalizePdfRotation(page.getRotation().angle);
  } catch {
    return 0;
  }
}

/** Crop clipped to the MediaBox. A missing or empty crop is the MediaBox. */
function viewBox(page: PDFPage, media: PdfPageBox): PdfPageBox {
  const raw = readRect(page, CROP_BOX_NAME);
  if (!raw) return media;
  return clipToMedia(raw, media) ?? media;
}

/**
 * MediaBox falls back to Letter. CropBox falls back to that MediaBox,
 * then is clipped to it. The clipped crop is the page view: at the
 * default user unit its size, with axes swapped for 90 and 270, equals
 * the viewer's scale-1 viewport.
 */
function inspectedPage(page: PDFPage, index: number): InspectedPdfPage {
  const mediaBox = readRect(page, MEDIA_BOX_NAME) ?? DEFAULT_MEDIA_BOX;
  return {
    page: index + 1,
    rotation: pageRotation(page),
    mediaBox,
    cropBox: viewBox(page, mediaBox),
  };
}

/**
 * Size, `%PDF-` magic, page count, page boxes, and SHA-256 for a PDF
 * buffer. This is the only pdf-lib parse. `uploadOriginal` and field
 * placement both call it, so an encrypted file throws
 * `file_unreadable` instead of a raw pdf-lib error. A missing or
 * malformed page box uses the Letter and MediaBox fallbacks. The page
 * cap is optional:
 * upload omits it, and placement passes `MAX_PDF_PAGES`.
 */
export async function inspectPdfBytes(
  body: Buffer,
  options?: InspectPdfOptions,
): Promise<InspectedPdf> {
  if (body.length > MAX_PDF_BYTES) throw new PayloadTooLargeException('file_too_large');
  if (body.length < PDF_MAGIC.length || !body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new UnsupportedMediaTypeException('file_not_pdf');
  }

  let pageBoxes: InspectedPdfPage[];
  try {
    const doc = await PDFDocument.load(body, {
      updateMetadata: false,
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    pageBoxes = doc.getPages().map((page, index) => inspectedPage(page, index));
  } catch {
    throw new BadRequestException('file_unreadable');
  }
  if (pageBoxes.length <= 0) throw new BadRequestException('file_unreadable');
  if (options?.maxPages !== undefined && pageBoxes.length > options.maxPages) {
    throw new BadRequestException('file_too_many_pages');
  }

  const sha256 = createHash('sha256').update(body).digest('hex');
  return { pages: pageBoxes.length, sha256, pageBoxes };
}
