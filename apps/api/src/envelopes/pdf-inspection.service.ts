import { createHash } from 'node:crypto';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';

/** 25 MB. Matches the upload route and `GDRIVE_CONVERSION_MAX_BYTES`. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

export interface InspectedPdf {
  readonly pages: number;
  readonly sha256: string;
}

/**
 * Size, `%PDF-` magic, page count, and SHA-256 for a PDF buffer.
 * `uploadOriginal` calls this and throws the same exceptions it always
 * has. Page images, anchor search, and AcroForm reuse belong here so
 * the inspect and preview tools can share them with upload.
 */
export async function inspectPdfBytes(body: Buffer): Promise<InspectedPdf> {
  if (body.length > MAX_PDF_BYTES) throw new PayloadTooLargeException('file_too_large');
  if (body.length < PDF_MAGIC.length || !body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    throw new UnsupportedMediaTypeException('file_not_pdf');
  }

  let pages: number;
  try {
    const doc = await PDFDocument.load(body, {
      updateMetadata: false,
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    pages = doc.getPageCount();
  } catch {
    throw new BadRequestException('file_unreadable');
  }
  if (pages <= 0) throw new BadRequestException('file_unreadable');

  const sha256 = createHash('sha256').update(body).digest('hex');
  return { pages, sha256 };
}
