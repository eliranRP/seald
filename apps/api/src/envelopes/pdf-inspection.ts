import { createHash } from 'node:crypto';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument, type PDFPage } from 'pdf-lib';

/**
 * 25 MB service cap. The upload route's multer limit is 30 MB so a body
 * just over this cap is rejected as `file_too_large` instead of the
 * connection being reset. `GDRIVE_CONVERSION_MAX_BYTES` defaults to the
 * same 25 MB.
 */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export type PdfPageRotation = 0 | 90 | 180 | 270;

/** Axis-aligned box in PDF user space. `x`/`y` is the lower-left corner. */
export interface PdfUserBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One page as a viewer displays it. `width` and `height` are the CropBox
 * (MediaBox when the page has no CropBox) in PDF points, with `/Rotate`
 * 90 and 270 swapping the axes. `page` is 1-based.
 */
export interface PdfPageSize {
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: PdfPageRotation;
  readonly cropBox: PdfUserBox;
  readonly mediaBox: PdfUserBox;
}

export interface InspectedPdf {
  readonly pages: number;
  readonly sha256: string;
  readonly pageSizes: readonly PdfPageSize[];
}

/**
 * Size, `%PDF-` magic, page count, displayed page sizes, and SHA-256 for
 * a PDF buffer. `uploadOriginal` calls this and throws the same exceptions
 * it always has. Page images, anchor search, and AcroForm reuse belong
 * here so the inspect and preview tools can share them with upload.
 */
export async function inspectPdfBytes(body: Buffer): Promise<InspectedPdf> {
  if (body.length > MAX_PDF_BYTES) throw new PayloadTooLargeException('file_too_large');
  if (body.length < PDF_MAGIC.length || !body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new UnsupportedMediaTypeException('file_not_pdf');
  }

  let pageSizes: PdfPageSize[];
  try {
    const doc = await PDFDocument.load(body, {
      updateMetadata: false,
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    pageSizes = doc.getPages().map((page, index) => pageSizeOf(page, index + 1));
  } catch {
    throw new BadRequestException('file_unreadable');
  }
  if (pageSizes.length <= 0) throw new BadRequestException('file_unreadable');

  const sha256 = createHash('sha256').update(body).digest('hex');
  return { pages: pageSizes.length, sha256, pageSizes };
}

function normalizePageRotation(angle: number): PdfPageRotation {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((Math.round(angle) % 360) + 360) % 360;
  if (wrapped === 90 || wrapped === 180 || wrapped === 270) return wrapped;
  return 0;
}

/** pdf.js default page when `/MediaBox` is missing: US Letter, 612×792 pt. */
const LETTER_BOX: PdfUserBox = { x: 0, y: 0, width: 612, height: 792 };

function finiteBox(box: PdfUserBox): PdfUserBox | undefined {
  const { x, y, width, height } = box;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return undefined;
  const left = Math.min(x, x + width);
  const bottom = Math.min(y, y + height);
  const boxWidth = Math.abs(width);
  const boxHeight = Math.abs(height);
  if (!(boxWidth > 0) || !(boxHeight > 0)) return undefined;
  return { x: left, y: bottom, width: boxWidth, height: boxHeight };
}

/** Intersection of the crop with the media box. An empty overlap uses the media box. */
function clipToMedia(crop: PdfUserBox, media: PdfUserBox): PdfUserBox {
  const left = Math.max(crop.x, media.x);
  const bottom = Math.max(crop.y, media.y);
  const right = Math.min(crop.x + crop.width, media.x + media.width);
  const top = Math.min(crop.y + crop.height, media.y + media.height);
  const width = right - left;
  const height = top - bottom;
  if (!(width > 0) || !(height > 0)) return media;
  return { x: left, y: bottom, width, height };
}

function readMediaBox(page: PDFPage): PdfUserBox {
  try {
    return finiteBox(page.getMediaBox()) ?? LETTER_BOX;
  } catch {
    return LETTER_BOX;
  }
}

function readCropBox(page: PDFPage, mediaBox: PdfUserBox): PdfUserBox {
  try {
    const crop = finiteBox(page.getCropBox());
    if (!crop) return mediaBox;
    return clipToMedia(crop, mediaBox);
  } catch {
    return mediaBox;
  }
}

function readRotation(page: PDFPage): PdfPageRotation {
  try {
    return normalizePageRotation(page.getRotation().angle);
  } catch {
    return 0;
  }
}

/**
 * Displayed size at pdf.js scale 1. A missing or unusable MediaBox is
 * Letter. A CropBox that is not a 4-number rectangle falls back to the
 * MediaBox. Reversed corners are normalized, then the crop is clipped
 * to the media box. Geometry errors stay inside this function so
 * `inspectPdfBytes` does not report `file_unreadable`.
 */
function pageSizeOf(page: PDFPage, pageNumber: number): PdfPageSize {
  const mediaBox = readMediaBox(page);
  const cropBox = readCropBox(page, mediaBox);
  const rotation = readRotation(page);
  const swap = rotation === 90 || rotation === 270;
  return {
    page: pageNumber,
    width: swap ? cropBox.height : cropBox.width,
    height: swap ? cropBox.width : cropBox.height,
    rotation,
    cropBox,
    mediaBox,
  };
}
