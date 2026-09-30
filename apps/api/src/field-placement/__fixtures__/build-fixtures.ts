import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

/** Baseline left of "AnchorTarget", PDF user space, y up. */
export const ANCHOR_TEXT = 'AnchorTarget';
export const ANCHOR_FONT_SIZE = 12;

export const LETTER = { width: 612, height: 792 } as const;
/** pdf-lib `PageSizes.A4`. */
export const A4 = { width: 595.28, height: 841.89 } as const;
export const CROP = { x: 36, y: 36, width: 540, height: 720 } as const;

export const LETTER_ANCHOR = { x: 72, y: 700 } as const;
export const A4_ANCHOR = { x: 50, y: 780 } as const;
/** On a 90° page this displays with room to the right of the text. */
export const ROTATED_ANCHOR = { x: 100, y: 200 } as const;
export const CROP_ANCHOR = { x: 80, y: 400 } as const;

export interface BuiltFixture {
  readonly bytes: Uint8Array;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rotation: 0 | 90;
  readonly displayed: { readonly width: number; readonly height: number };
}

async function document(): Promise<{
  doc: PDFDocument;
  font: Awaited<ReturnType<PDFDocument['embedFont']>>;
}> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date(Date.UTC(2026, 0, 1)));
  doc.setModificationDate(new Date(Date.UTC(2026, 0, 1)));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { doc, font };
}

export async function buildLetter(): Promise<BuiltFixture> {
  const { doc, font } = await document();
  const page = doc.addPage([LETTER.width, LETTER.height]);
  page.drawText(ANCHOR_TEXT, { ...LETTER_ANCHOR, size: ANCHOR_FONT_SIZE, font });
  return {
    bytes: await doc.save(),
    anchor: LETTER_ANCHOR,
    crop: { x: 0, y: 0, width: LETTER.width, height: LETTER.height },
    rotation: 0,
    displayed: { width: LETTER.width, height: LETTER.height },
  };
}

export async function buildA4(): Promise<BuiltFixture> {
  const { doc, font } = await document();
  const page = doc.addPage([A4.width, A4.height]);
  page.drawText(ANCHOR_TEXT, { ...A4_ANCHOR, size: ANCHOR_FONT_SIZE, font });
  return {
    bytes: await doc.save(),
    anchor: A4_ANCHOR,
    crop: { x: 0, y: 0, width: A4.width, height: A4.height },
    rotation: 0,
    displayed: { width: A4.width, height: A4.height },
  };
}

export async function buildRotated(): Promise<BuiltFixture> {
  const { doc, font } = await document();
  const page = doc.addPage([LETTER.width, LETTER.height]);
  page.setRotation(degrees(90));
  page.drawText(ANCHOR_TEXT, { ...ROTATED_ANCHOR, size: ANCHOR_FONT_SIZE, font });
  return {
    bytes: await doc.save(),
    anchor: ROTATED_ANCHOR,
    crop: { x: 0, y: 0, width: LETTER.width, height: LETTER.height },
    rotation: 90,
    displayed: { width: LETTER.height, height: LETTER.width },
  };
}

export async function buildCropBox(): Promise<BuiltFixture> {
  const { doc, font } = await document();
  const page = doc.addPage([LETTER.width, LETTER.height]);
  page.setCropBox(CROP.x, CROP.y, CROP.width, CROP.height);
  page.drawText(ANCHOR_TEXT, { ...CROP_ANCHOR, size: ANCHOR_FONT_SIZE, font });
  return {
    bytes: await doc.save(),
    anchor: CROP_ANCHOR,
    crop: CROP,
    rotation: 0,
    displayed: { width: CROP.width, height: CROP.height },
  };
}

export async function buildAcroForm(): Promise<BuiltFixture> {
  const { doc, font } = await document();
  const page = doc.addPage([LETTER.width, LETTER.height]);
  page.drawText(ANCHOR_TEXT, { ...LETTER_ANCHOR, size: ANCHOR_FONT_SIZE, font });
  const form = doc.getForm();
  form.createTextField('SignerName').addToPage(page, {
    x: 100,
    y: 500,
    width: 180,
    height: 24,
    borderWidth: 0,
  });
  form.createCheckBox('AgreeBox').addToPage(page, {
    x: 100,
    y: 460,
    width: 18,
    height: 18,
    borderWidth: 0,
  });
  return {
    bytes: await doc.save(),
    anchor: LETTER_ANCHOR,
    crop: { x: 0, y: 0, width: LETTER.width, height: LETTER.height },
    rotation: 0,
    displayed: { width: LETTER.width, height: LETTER.height },
  };
}
