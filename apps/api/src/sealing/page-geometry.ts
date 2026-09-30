import type { PDFPage } from 'pdf-lib';
import { normalizePageRotation, type PageGeometry } from 'shared';

/**
 * Read the displayed-page geometry pdf.js uses: CropBox (MediaBox when the
 * page has no CropBox) and `/Rotate`. pdf-lib's `getWidth`/`getHeight` are
 * the MediaBox in user space and ignore both.
 */
export function pageGeometryOf(page: PDFPage): PageGeometry {
  const box = page.getCropBox();
  return {
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
    rotation: normalizePageRotation(page.getRotation().angle),
  };
}
