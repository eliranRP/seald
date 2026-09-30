import {
  displayedBoxToPdfDraw,
  displayedPageSize,
  displayedPointToPdf,
  pdfPointToDisplayed,
  storedPageGeometry,
  type PageGeometry,
  type PageRotation,
} from 'shared';

const LETTER = { x: 0, y: 0, width: 612, height: 792 };
const A4 = { x: 0, y: 0, width: 595.28, height: 841.89 };
const LEGAL = { x: 0, y: 0, width: 612, height: 1008 };

function geometry(box: PageGeometry['box'], rotation: PageRotation): PageGeometry {
  return { box, rotation };
}

function maxRoundTripError(page: PageGeometry): number {
  const size = displayedPageSize(page);
  let max = 0;
  for (let x = 0; x <= size.width; x += size.width / 8) {
    for (let y = 0; y <= size.height; y += size.height / 8) {
      const pdf = displayedPointToPdf(page, x, y);
      const back = pdfPointToDisplayed(page, pdf.x, pdf.y);
      max = Math.max(max, Math.abs(back.x - x), Math.abs(back.y - y));
    }
  }
  return max;
}

describe('placementGeometry', () => {
  it.each([0, 90, 180, 270] as const)(
    'round-trips /Rotate %s within 0.5pt on Letter',
    (rotation) => {
      expect(maxRoundTripError(geometry(LETTER, rotation))).toBeLessThan(0.5);
    },
  );

  it('maps a CropBox offset into user space', () => {
    const crop = { x: 36, y: 36, width: 540, height: 720 };
    const page = geometry(crop, 0);
    const origin = displayedPointToPdf(page, 0, 0);
    expect(origin.x).toBeCloseTo(36, 5);
    expect(origin.y).toBeCloseTo(756, 5);
    const field = displayedBoxToPdfDraw(page, { x: 0, y: 0, width: 0.1, height: 0.1 });
    expect(field.x).toBeCloseTo(36, 5);
    expect(field.y).toBeCloseTo(756 - 72, 5);
    expect(maxRoundTripError(page)).toBeLessThan(0.5);
  });

  it('keeps a non-zero MediaBox origin', () => {
    const media = { x: 10, y: 20, width: 612, height: 792 };
    const page = geometry(media, 0);
    const origin = displayedPointToPdf(page, 0, 0);
    expect(origin).toEqual({ x: 10, y: 812 });
    expect(maxRoundTripError(page)).toBeLessThan(0.5);
  });

  it.each([
    ['Letter', LETTER],
    ['A4', A4],
    ['Legal', LEGAL],
  ] as const)('places a 10% inset on %s within 0.5pt', (_name, box) => {
    const page = geometry(box, 0);
    const displayedX = box.width * 0.1;
    const displayedY = box.height * 0.1;
    const pdf = displayedPointToPdf(page, displayedX, displayedY);
    expect(pdf.x).toBeCloseTo(box.x + displayedX, 5);
    expect(pdf.y).toBeCloseTo(box.y + box.height - displayedY, 5);
    expect(Math.abs(pdf.x - (box.x + displayedX))).toBeLessThan(0.5);
    expect(Math.abs(pdf.y - (box.y + box.height - displayedY))).toBeLessThan(0.5);
  });

  it('swaps the displayed size for /Rotate 90 and 270', () => {
    expect(displayedPageSize(geometry(LETTER, 90))).toEqual({ width: 792, height: 612 });
    expect(displayedPageSize(geometry(LETTER, 270))).toEqual({ width: 792, height: 612 });
    const anchor = displayedBoxToPdfDraw(geometry(LETTER, 90), {
      x: 0.1,
      y: 0.2,
      width: 0.25,
      height: 0.06,
    });
    expect(anchor.rotate).toBe(90);
    expect(anchor.width).toBeCloseTo(0.25 * 792, 5);
    expect(anchor.height).toBeCloseTo(0.06 * 612, 5);
  });

  it('stores view size from the CropBox and rotation', () => {
    const stored = storedPageGeometry({
      page: 2,
      rotation: 90,
      mediabox: LETTER,
      cropbox: { x: 36, y: 36, width: 540, height: 720 },
    });
    expect(stored.page).toBe(2);
    expect(stored.rotation).toBe(90);
    expect(stored.view_width).toBe(720);
    expect(stored.view_height).toBe(540);
    expect(stored.cropbox.x).toBe(36);
  });
});
