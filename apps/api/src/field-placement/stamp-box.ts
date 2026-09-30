import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
} from 'pdf-lib';
import { displayedBoxToPdfRect, type PdfViewport } from './displayed-page';
import type { DisplayedBox } from './field-placement.types';

export interface StampTarget {
  readonly page: number;
  readonly viewport: PdfViewport;
  readonly box: DisplayedBox;
}

/**
 * Stroke each box in raw PDF user space. This is the placement proof,
 * not the sealer: it uses `displayedBoxToPdfRect` and does not call
 * `burnInField`. Insert C will make the seal use that same helper.
 */
export async function stampDisplayedBoxes(
  pdfBytes: Uint8Array,
  targets: readonly StampTarget[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  for (const target of targets) {
    const page = pages[target.page - 1];
    if (!page) continue;
    const rect = displayedBoxToPdfRect(target.viewport, target.box);
    page.pushOperators(
      pushGraphicsState(),
      setLineWidth(0.6),
      setStrokingRgbColor(0.85, 0.15, 0.35),
      rectangle(rect.x, rect.y, rect.width, rect.height),
      stroke(),
      popGraphicsState(),
    );
  }
  const saved = await doc.save();
  return new Uint8Array(saved);
}
