import { PDFDocument } from 'pdf-lib';

/** A4 in points; each page keeps its photo's aspect inside this box. */
const A4_LONG = 842;
const A4_SHORT = 595;

/**
 * Builds one PDF from JPEG pages, in order, in the browser. Each page is
 * sized to its photo (portrait or landscape A4) and the photo fills it.
 */
export async function buildScanPdf(
  jpegPages: ReadonlyArray<Uint8Array>,
  fileName = 'Scan.pdf',
): Promise<File> {
  if (jpegPages.length === 0) throw new Error('no_pages');
  const doc = await PDFDocument.create();
  for (const bytes of jpegPages) {
    const image = await doc.embedJpg(bytes);
    const portrait = image.height >= image.width;
    const boxW = portrait ? A4_SHORT : A4_LONG;
    const boxH = portrait ? A4_LONG : A4_SHORT;
    const scale = Math.min(boxW / image.width, boxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const page = doc.addPage([w, h]);
    page.drawImage(image, { x: 0, y: 0, width: w, height: h });
  }
  const out = await doc.save();
  return new File([out as BlobPart], fileName, { type: 'application/pdf' });
}
