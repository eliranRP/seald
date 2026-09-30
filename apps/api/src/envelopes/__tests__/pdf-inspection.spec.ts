import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { inspectPdfBytes, MAX_PDF_BYTES } from '../pdf-inspection';

describe('inspectPdfBytes', () => {
  it('returns the page count and sha256 of a PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    doc.addPage([200, 100]);
    const body = Buffer.from(await doc.save());

    const inspected = await inspectPdfBytes(body);

    expect(inspected.pages).toBe(2);
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.page_geometry).toEqual([
      {
        page: 1,
        view_width: 200,
        view_height: 100,
        rotation: 0,
        mediabox: { x: 0, y: 0, width: 200, height: 100 },
        cropbox: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        page: 2,
        view_width: 200,
        view_height: 100,
        rotation: 0,
        mediabox: { x: 0, y: 0, width: 200, height: 100 },
        cropbox: { x: 0, y: 0, width: 200, height: 100 },
      },
    ]);
  });

  it('rejects a buffer that is not a PDF', async () => {
    await expect(inspectPdfBytes(Buffer.from('not a pdf'))).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects an empty buffer', async () => {
    await expect(inspectPdfBytes(Buffer.alloc(0))).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('rejects a buffer over the 25 MB cap', async () => {
    const body = Buffer.alloc(MAX_PDF_BYTES + 1);
    body.write('%PDF-');
    await expect(inspectPdfBytes(body)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects bytes that start with the PDF magic but do not parse', async () => {
    await expect(
      inspectPdfBytes(Buffer.from('%PDF-1.4 not a real document')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
