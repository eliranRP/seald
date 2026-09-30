import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  displayedPageSize,
  displayedPointToPdf,
  fieldPlacementError,
  pdfPointToDisplayed,
  type PageGeometry,
} from 'shared';
import { burnInField, type BurnInAssets, type BurnInField } from '../burn-in-fields';
import { pageGeometryOf } from '../page-geometry';

/**
 * A stamped field must land within this many PDF points of the displayed-page
 * rectangle pdf.js shows. 0.5pt is the placement contract.
 */
const TOLERANCE_PT = 0.5;

const KINDS = ['signature', 'initials', 'date', 'text', 'checkbox', 'email'] as const;

const FIXTURES: ReadonlyArray<{ readonly name: string; readonly file: string }> = [
  { name: 'Letter', file: 'letter.pdf' },
  { name: 'A4', file: 'a4.pdf' },
  { name: 'Letter+A4+Legal', file: 'mixed-letter-a4-legal.pdf' },
  { name: 'Letter rotated 90', file: 'letter-rotate-90.pdf' },
  { name: 'Letter rotated 270', file: 'letter-rotate-270.pdf' },
  { name: 'Letter CropBox 36pt', file: 'letter-crop-36.pdf' },
];

interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface MeasuredText {
  readonly x: number;
  readonly y: number;
  readonly aheadX: number;
  readonly aheadY: number;
}

interface MeasuredPage {
  readonly width: number;
  readonly height: number;
  readonly points: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly pdfX: number;
    readonly pdfY: number;
  }>;
  readonly images: ReadonlyArray<ViewportRect>;
  readonly boxes: ReadonlyArray<ViewportRect>;
  readonly texts: ReadonlyArray<MeasuredText>;
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==',
  'base64',
);

function fieldAt(kind: (typeof KINDS)[number], index: number): BurnInField {
  const checkbox = kind === 'checkbox';
  return {
    kind,
    x: 0.12,
    y: 0.06 + index * 0.13,
    width: checkbox ? 0.05 : 0.22,
    height: checkbox ? 0.05 : 0.045,
    value_text: kind === 'date' ? '2026-09-30' : kind === 'email' ? 'ada@example.com' : 'Hello',
    value_boolean: false,
  };
}

function measureStampedPdf(bytes: Uint8Array): { pages: MeasuredPage[] } {
  const dir = mkdtempSync(join(tmpdir(), 'seald-place-'));
  const pdfPath = join(dir, 'stamped.pdf');
  writeFileSync(pdfPath, bytes);
  try {
    const script = join(__dirname, 'measure-placement.mjs');
    // stderr is piped so pdf.js's missing-font warning (we read text matrices,
    // not glyphs) does not leak into the Jest reporter.
    const out = execFileSync(process.execPath, [script, pdfPath], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out) as { pages: MeasuredPage[] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectRect(
  actual: ViewportRect,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  expect(Math.abs(actual.left - left)).toBeLessThanOrEqual(TOLERANCE_PT);
  expect(Math.abs(actual.top - top)).toBeLessThanOrEqual(TOLERANCE_PT);
  expect(Math.abs(actual.right - (left + width))).toBeLessThanOrEqual(TOLERANCE_PT);
  expect(Math.abs(actual.bottom - (top + height))).toBeLessThanOrEqual(TOLERANCE_PT);
}

function nearestRect(rects: ReadonlyArray<ViewportRect>, left: number, top: number): ViewportRect {
  let best = rects[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const rect of rects) {
    const dist = Math.hypot(rect.left - left, rect.top - top);
    if (dist < bestDist) {
      best = rect;
      bestDist = dist;
    }
  }
  if (!best) throw new Error('no drawn rectangle');
  return best;
}

function nearestText(texts: ReadonlyArray<MeasuredText>, x: number, y: number): MeasuredText {
  let best = texts[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const text of texts) {
    const dist = Math.hypot(text.x - x, text.y - y);
    if (dist < bestDist) {
      best = text;
      bestDist = dist;
    }
  }
  if (!best) throw new Error('no drawn text');
  return best;
}

describe('fieldPlacementError', () => {
  it('rejects placements the seal used to skip or draw off-page', () => {
    expect(fieldPlacementError({ x: 1.1, y: 0.1, page: 1, width: 0.1, height: 0.1 }, 1)).toBe(
      'field_x_out_of_range',
    );
    expect(fieldPlacementError({ x: 0.8, y: 0.1, page: 1, width: 0.3, height: 0.1 }, 1)).toBe(
      'field_exceeds_page',
    );
    expect(fieldPlacementError({ x: 0.1, y: 0.9, page: 1, width: 0.1, height: 0.2 }, 1)).toBe(
      'field_exceeds_page',
    );
    expect(fieldPlacementError({ x: 0.1, y: 0.1, page: 4, width: 0.1, height: 0.1 }, 3)).toBe(
      'field_page_out_of_range',
    );
    expect(fieldPlacementError({ x: 0.5, y: 0.5, page: 3, width: 0.5, height: 0.5 }, 3)).toBeNull();
    expect(fieldPlacementError({ x: 0.1, y: 0.1, page: 1 }, null)).toBeNull();
  });
});

describe('field placement on the displayed page', () => {
  it.each(FIXTURES)('$name: every field kind lands within 0.5pt', async ({ file }) => {
    const bytes = readFileSync(join(__dirname, 'fixtures', file));
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const image = await doc.embedPng(PNG);
    const assets: BurnInAssets = {
      sigImg: image,
      initialsImg: image,
      helvetica: font,
      helveticaBold: font,
    };
    const pages = doc.getPages();
    const geometries: PageGeometry[] = pages.map((pdfPage) => pageGeometryOf(pdfPage));
    for (const pdfPage of pages) {
      for (let kindIndex = 0; kindIndex < KINDS.length; kindIndex += 1) {
        burnInField(pdfPage, fieldAt(KINDS[kindIndex]!, kindIndex), assets);
      }
    }

    const measured = measureStampedPdf(await doc.save());
    expect(measured.pages).toHaveLength(geometries.length);

    geometries.forEach((geometry, pageIndex) => {
      const page = measured.pages[pageIndex];
      if (!page) throw new Error('missing measured page');
      const displayed = displayedPageSize(geometry);
      expect(Math.abs(page.width - displayed.width)).toBeLessThanOrEqual(TOLERANCE_PT);
      expect(Math.abs(page.height - displayed.height)).toBeLessThanOrEqual(TOLERANCE_PT);

      for (const sample of page.points) {
        const fromHelper = displayedPointToPdf(geometry, sample.x, sample.y);
        expect(
          Math.hypot(sample.pdfX - fromHelper.x, sample.pdfY - fromHelper.y),
        ).toBeLessThanOrEqual(0.01);
        const back = pdfPointToDisplayed(geometry, fromHelper.x, fromHelper.y);
        expect(Math.hypot(back.x - sample.x, back.y - sample.y)).toBeLessThanOrEqual(0.01);
      }

      const textHeight = font.heightAtSize(12);
      for (let kindIndex = 0; kindIndex < KINDS.length; kindIndex += 1) {
        const kind = KINDS[kindIndex]!;
        const field = fieldAt(kind, kindIndex);
        const size = displayedPageSize(geometry);
        const left = field.x * size.width;
        const top = field.y * size.height;
        const width = (field.width ?? 0) * size.width;
        const height = (field.height ?? 0) * size.height;
        if (kind === 'signature' || kind === 'initials') {
          expectRect(nearestRect(page.images, left, top), left, top, width, height);
        } else if (kind === 'checkbox') {
          expectRect(nearestRect(page.boxes, left, top), left, top, width, height);
        } else {
          const expectedX = left + 22;
          const expectedY = top + height / 2 + textHeight / 2;
          const mark = nearestText(page.texts, expectedX, expectedY);
          expect(Math.abs(mark.x - expectedX)).toBeLessThanOrEqual(TOLERANCE_PT);
          expect(Math.abs(mark.y - expectedY)).toBeLessThanOrEqual(TOLERANCE_PT);
          expect(mark.aheadX - mark.x).toBeGreaterThan(30);
          expect(Math.abs(mark.aheadY - mark.y)).toBeLessThanOrEqual(TOLERANCE_PT);
        }
      }
    });
  });
});
