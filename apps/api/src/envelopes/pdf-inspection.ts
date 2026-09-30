import { createHash } from 'node:crypto';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

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

export function normalizePdfRotation(angle: number): 0 | 90 | 180 | 270 {
  const turns = ((Math.round(angle) % 360) + 360) % 360;
  if (turns === 90 || turns === 180 || turns === 270) return turns;
  return 0;
}

/**
 * Size, `%PDF-` magic, page count, page boxes, and SHA-256 for a PDF
 * buffer. This is the only pdf-lib parse. `uploadOriginal` and field
 * placement both call it, so an encrypted file throws
 * `file_unreadable` instead of a raw pdf-lib error. The page cap is
 * optional: upload omits it, and placement passes `MAX_PDF_PAGES`.
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
    pageBoxes = doc.getPages().map((page, index) => {
      const media = page.getMediaBox();
      const crop = page.getCropBox();
      return {
        page: index + 1,
        rotation: normalizePdfRotation(page.getRotation().angle),
        mediaBox: { x: media.x, y: media.y, width: media.width, height: media.height },
        cropBox: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
      };
    });
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
