import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument, degrees } from 'pdf-lib';
import { inspectPdfBytes, MAX_PDF_BYTES } from '../pdf-inspection';
import {
  pdfWithMalformedCropBox,
  pdfWithOversizedCropBox,
  pdfWithReversedCropBox,
  pdfWithoutMediaBox,
} from './pdf-geometry-fixtures';

describe('inspectPdfBytes', () => {
  it('returns the page count and sha256 of a PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    doc.addPage([200, 100]);
    const body = Buffer.from(await doc.save());

    const inspected = await inspectPdfBytes(body);

    expect(inspected.pages).toBe(2);
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.pageSizes).toEqual([
      {
        page: 1,
        width: 200,
        height: 100,
        rotation: 0,
        cropBox: { x: 0, y: 0, width: 200, height: 100 },
        mediaBox: { x: 0, y: 0, width: 200, height: 100 },
      },
      {
        page: 2,
        width: 200,
        height: 100,
        rotation: 0,
        cropBox: { x: 0, y: 0, width: 200, height: 100 },
        mediaBox: { x: 0, y: 0, width: 200, height: 100 },
      },
    ]);
  });

  it('reports displayed size from the CropBox and /Rotate', async () => {
    const doc = await PDFDocument.create();
    const upright = doc.addPage([612, 792]);
    upright.setCropBox(36, 36, 540, 720);
    const turned = doc.addPage([200, 100]);
    turned.setRotation(degrees(90));
    turned.setCropBox(10, 20, 80, 40);
    const body = Buffer.from(await doc.save());

    const inspected = await inspectPdfBytes(body);

    expect(inspected.pageSizes[0]).toEqual({
      page: 1,
      width: 540,
      height: 720,
      rotation: 0,
      cropBox: { x: 36, y: 36, width: 540, height: 720 },
      mediaBox: { x: 0, y: 0, width: 612, height: 792 },
    });
    expect(inspected.pageSizes[1]).toMatchObject({
      page: 2,
      width: 40,
      height: 80,
      rotation: 90,
      cropBox: { x: 10, y: 20, width: 80, height: 40 },
    });
  });

  it('uses Letter when the page has no MediaBox', async () => {
    const inspected = await inspectPdfBytes(await pdfWithoutMediaBox());
    expect(inspected.pageSizes[0]).toMatchObject({
      page: 1,
      width: 612,
      height: 792,
      rotation: 0,
      mediaBox: { x: 0, y: 0, width: 612, height: 792 },
      cropBox: { x: 0, y: 0, width: 612, height: 792 },
    });
  });

  it('falls back to the MediaBox when the CropBox is not a rectangle', async () => {
    const inspected = await inspectPdfBytes(await pdfWithMalformedCropBox());
    expect(inspected.pageSizes[0]).toMatchObject({
      width: 200,
      height: 100,
      cropBox: { x: 0, y: 0, width: 200, height: 100 },
      mediaBox: { x: 0, y: 0, width: 200, height: 100 },
    });
  });

  it('normalizes a CropBox whose corners are reversed', async () => {
    const inspected = await inspectPdfBytes(await pdfWithReversedCropBox());
    expect(inspected.pageSizes[0]).toMatchObject({
      width: 200,
      height: 100,
      cropBox: { x: 0, y: 0, width: 200, height: 100 },
    });
  });

  it('clips a CropBox to the MediaBox', async () => {
    const inspected = await inspectPdfBytes(await pdfWithOversizedCropBox());
    expect(inspected.pageSizes[0]).toMatchObject({
      width: 200,
      height: 100,
      cropBox: { x: 0, y: 0, width: 200, height: 100 },
      mediaBox: { x: 0, y: 0, width: 200, height: 100 },
    });
  });

  it('swaps width and height for 270 and -90 degree rotation', async () => {
    const turned = await PDFDocument.create();
    const page270 = turned.addPage([200, 100]);
    page270.setRotation(degrees(270));
    page270.setCropBox(10, 20, 80, 40);
    const negative = turned.addPage([200, 100]);
    negative.setRotation(degrees(-90));
    negative.setCropBox(10, 20, 80, 40);
    const inspected = await inspectPdfBytes(Buffer.from(await turned.save()));
    expect(inspected.pageSizes[0]).toMatchObject({
      width: 40,
      height: 80,
      rotation: 270,
      cropBox: { x: 10, y: 20, width: 80, height: 40 },
    });
    expect(inspected.pageSizes[1]).toMatchObject({
      width: 40,
      height: 80,
      rotation: 270,
    });
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

  it('accepts a buffer of exactly 25 MB and rejects one byte over', async () => {
    const atCap = Buffer.alloc(MAX_PDF_BYTES);
    atCap.write('%PDF-');
    await expect(inspectPdfBytes(atCap)).rejects.toBeInstanceOf(BadRequestException);
    await expect(inspectPdfBytes(atCap)).rejects.not.toBeInstanceOf(PayloadTooLargeException);

    const over = Buffer.alloc(MAX_PDF_BYTES + 1);
    over.write('%PDF-');
    await expect(inspectPdfBytes(over)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects bytes that start with the PDF magic but do not parse', async () => {
    await expect(
      inspectPdfBytes(Buffer.from('%PDF-1.4 not a real document')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
