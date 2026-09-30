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

function copyBox(box: PdfUserBox): PdfUserBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function pageSizeOf(page: PDFPage, pageNumber: number): PdfPageSize {
  const cropBox = copyBox(page.getCropBox());
  const mediaBox = copyBox(page.getMediaBox());
  const rotation = normalizePageRotation(page.getRotation().angle);
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
