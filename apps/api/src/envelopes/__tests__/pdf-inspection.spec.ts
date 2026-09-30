import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFArray, PDFDocument, PDFName, PDFNumber, degrees, type PDFPage } from 'pdf-lib';
import { stopPdfWorker, inspectWithPdfjs } from '../../field-placement/pdfjs-host';
import {
  DEFAULT_MEDIA_BOX,
  inspectPdfBytes,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  type InspectedPdfPage,
} from '../pdf-inspection';

describe('inspectPdfBytes', () => {
  it('returns the page count and sha256 of a PDF', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 100]);
    doc.addPage([200, 100]);
    const body = Buffer.from(await doc.save());

    const inspected = await inspectPdfBytes(body);

    expect(inspected.pages).toBe(2);
    expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.pageBoxes[0]?.mediaBox).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(inspected.pageBoxes[0]?.rotation).toBe(0);
  });

  it('accepts a PDF over the placement page cap when the caller does not set one', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < MAX_PDF_PAGES + 1; i += 1) doc.addPage([20, 20]);
    const body = Buffer.from(await doc.save());
    const inspected = await inspectPdfBytes(body);
    expect(inspected.pages).toBe(MAX_PDF_PAGES + 1);
  });

  it('rejects a PDF with more pages than the cap when the caller sets one', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < MAX_PDF_PAGES + 1; i += 1) doc.addPage([20, 20]);
    const body = Buffer.from(await doc.save());
    await expect(inspectPdfBytes(body, { maxPages: MAX_PDF_PAGES })).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

  it('keeps a readable PDF when page boxes are missing or malformed', async () => {
    const body = await boxFixture();
    const inspected = await inspectPdfBytes(body);
    const [missing, malformed, reversed, clipped, outside] = inspected.pageBoxes;

    expect(inspected.pages).toBe(5);
    expect(missing).toMatchObject({
      page: 1,
      rotation: 0,
      mediaBox: DEFAULT_MEDIA_BOX,
      cropBox: DEFAULT_MEDIA_BOX,
    });
    expect(malformed?.mediaBox).toEqual({ x: 0, y: 0, width: 612, height: 792 });
    expect(malformed?.cropBox).toEqual(malformed?.mediaBox);
    expect(reversed?.cropBox).toEqual({ x: 40, y: 20, width: 160, height: 160 });
    expect(clipped).toMatchObject({
      rotation: 90,
      mediaBox: { x: 0, y: 0, width: 400, height: 500 },
      cropBox: { x: 0, y: 10, width: 400, height: 470 },
    });
    expect(outside?.cropBox).toEqual(outside?.mediaBox);
    expect(outside?.mediaBox).toEqual({ x: 0, y: 0, width: 612, height: 792 });
  });

  it('matches the pdf.js scale-1 viewport after clipping', async () => {
    const body = await boxFixture();
    const inspected = await inspectPdfBytes(body);
    const snapshot = await inspectWithPdfjs(body);

    for (const page of inspected.pageBoxes) {
      const view = snapshot.pages.find((item) => item.page === page.page);
      const size = displayedSize(page);
      expect(view?.width).toBeCloseTo(size.width, 3);
      expect(view?.height).toBeCloseTo(size.height, 3);
    }
  });
});

afterAll(async () => {
  await stopPdfWorker();
});

/** Crop width/height, axes swapped for 90 and 270, at user unit 1. */
function displayedSize(page: InspectedPdfPage): { width: number; height: number } {
  const swap = page.rotation === 90 || page.rotation === 270;
  return {
    width: swap ? page.cropBox.height : page.cropBox.width,
    height: swap ? page.cropBox.width : page.cropBox.height,
  };
}

function setBox(page: PDFPage, key: string, coords: readonly number[]): void {
  page.node.set(PDFName.of(key), page.doc.context.obj([...coords]));
}

/**
 * Five readable pages: no MediaBox, a 3-number CropBox, reversed
 * corners, a CropBox that hangs outside the MediaBox on a rotated
 * page, and a CropBox that misses the MediaBox entirely.
 */
async function boxFixture(): Promise<Buffer> {
  const doc = await PDFDocument.create();

  const missing = doc.addPage([200, 100]);
  missing.node.delete(PDFName.of('MediaBox'));

  const malformed = doc.addPage([612, 792]);
  const short = PDFArray.withContext(doc.context);
  short.push(PDFNumber.of(0));
  short.push(PDFNumber.of(0));
  short.push(PDFName.of('Nope'));
  malformed.node.set(PDFName.of('CropBox'), short);

  const reversed = doc.addPage([612, 792]);
  setBox(reversed, 'CropBox', [200, 180, 40, 20]);

  const clipped = doc.addPage([400, 500]);
  clipped.setRotation(degrees(90));
  setBox(clipped, 'CropBox', [-20, 10, 450, 480]);

  const outside = doc.addPage([612, 792]);
  setBox(outside, 'CropBox', [1000, 1000, 1100, 1200]);

  return Buffer.from(await doc.save());
}
