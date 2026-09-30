import { flipYForPdfLib } from '../../envelopes/coord';
import {
  ANCHOR_FONT_SIZE,
  ANCHOR_TEXT,
  ANCHOR_TEXT_WIDTH,
  A4,
  buildA4,
  buildAcroFormRotated,
  buildCropBox,
  buildDoubleAnchor,
  buildLetter,
  buildMediaOrigin,
  buildMixed,
  buildRotated,
  buildRotated180,
  buildRotated270,
  buildTwoWords,
  buildWidgetCatalog,
  LEGAL,
  LETTER,
  LETTER_ANCHOR,
  MEDIA_ORIGIN,
  ROTATED_180_ANCHOR,
  ROTATED_270_ANCHOR,
  SECOND_ANCHOR,
  type BuiltFixture,
} from '../__fixtures__/build-fixtures';
import { displayedBoxToStored, storedBoxToDisplayed } from '../displayed-page';
import { loadPdf, listPathBounds } from '../pdf-document';
import { stopPdfWorker, type PdfPathBound } from '../pdfjs-host';
import { resolvePlacementFields } from '../place-fields';
import { stampDisplayedBoxes } from '../stamp-box';
import { findAnchorMatches, groupTextLines, paginatePlacementText } from '../text-index';
import type { DisplayedBox } from '../field-placement.types';

const SLOP_PT = 0.5;

const CASES: readonly {
  name: string;
  build: () => Promise<BuiltFixture>;
}[] = [
  { name: 'letter', build: buildLetter },
  { name: 'a4', build: buildA4 },
  { name: 'rotated-90', build: buildRotated },
  { name: 'rotated-180', build: buildRotated180 },
  { name: 'rotated-270', build: buildRotated270 },
  { name: 'cropbox', build: buildCropBox },
  { name: 'media-origin', build: buildMediaOrigin },
];

const COORDINATE: DisplayedBox = { x: 36, y: 48, w: 144, h: 36 };

function displayedPoint(
  crop: BuiltFixture['crop'],
  rotation: BuiltFixture['rotation'],
  pdfX: number,
  pdfY: number,
): { x: number; y: number } {
  if (rotation === 90) return { x: pdfY - crop.y, y: pdfX - crop.x };
  if (rotation === 180) return { x: crop.x + crop.width - pdfX, y: pdfY - crop.y };
  if (rotation === 270) {
    return { x: crop.y + crop.height - pdfY, y: crop.x + crop.width - pdfX };
  }
  return { x: pdfX - crop.x, y: crop.y + crop.height - pdfY };
}

function enclose(points: readonly { x: number; y: number }[]): DisplayedBox {
  const first = points[0];
  if (!first) throw new Error('enclose needs a point');
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Glyph box of horizontal text, independent of the engine's invert. */
function formulaTextBox(
  crop: BuiltFixture['crop'],
  rotation: BuiltFixture['rotation'],
  anchor: { readonly x: number; readonly y: number },
  textWidth: number,
): DisplayedBox {
  return enclose([
    displayedPoint(crop, rotation, anchor.x, anchor.y),
    displayedPoint(crop, rotation, anchor.x + textWidth, anchor.y),
    displayedPoint(crop, rotation, anchor.x, anchor.y + ANCHOR_FONT_SIZE),
    displayedPoint(crop, rotation, anchor.x + textWidth, anchor.y + ANCHOR_FONT_SIZE),
  ]);
}

/** Displayed box → PDF user-space rect, independent of displayed-page.ts. */
function pdfRectFromDisplayed(
  crop: BuiltFixture['crop'],
  rotation: BuiltFixture['rotation'],
  box: DisplayedBox,
): PdfPathBound {
  if (rotation === 90) {
    return { x: crop.x + box.y, y: crop.y + box.x, width: box.h, height: box.w };
  }
  if (rotation === 180) {
    return {
      x: crop.x + crop.width - box.x - box.w,
      y: crop.y + box.y,
      width: box.w,
      height: box.h,
    };
  }
  if (rotation === 270) {
    return {
      x: crop.x + crop.width - box.y - box.h,
      y: crop.y + crop.height - box.x - box.w,
      width: box.h,
      height: box.w,
    };
  }
  return {
    x: crop.x + box.x,
    y: crop.y + crop.height - box.y - box.h,
    width: box.w,
    height: box.h,
  };
}

function expectNear(actual: number, expected: number, slop = SLOP_PT): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(slop);
}

function expectDisplayed(
  actual: { x: number; y: number; width: number; height: number },
  expected: DisplayedBox,
): void {
  expectNear(actual.x, expected.x);
  expectNear(actual.y, expected.y);
  expectNear(actual.width, expected.w);
  expectNear(actual.height, expected.h);
}

function expectRect(actual: PdfPathBound, expected: PdfPathBound): void {
  expectNear(actual.x, expected.x);
  expectNear(actual.y, expected.y);
  expectNear(actual.width, expected.width);
  expectNear(actual.height, expected.height);
}

function countNear(bounds: readonly PdfPathBound[], expected: PdfPathBound): number {
  return bounds.filter(
    (bound) =>
      Math.abs(bound.x - expected.x) <= SLOP_PT &&
      Math.abs(bound.y - expected.y) <= SLOP_PT &&
      Math.abs(bound.width - expected.width) <= SLOP_PT &&
      Math.abs(bound.height - expected.height) <= SLOP_PT,
  ).length;
}

afterAll(async () => {
  await stopPdfWorker();
});

describe('field placement geometry', () => {
  jest.setTimeout(60_000);

  it.each(CASES)(
    '$name: text, a placed box, and the stamped PDF match an independent formula',
    async ({ build }) => {
      const fixture = await build();
      const doc = await loadPdf(fixture.bytes);
      const page = doc.pages[0];
      expect(page).toBeDefined();
      if (!page) return;
      expect(doc.pageCount).toBe(1);
      expectNear(page.info.width, fixture.displayed.width, 0.05);
      expectNear(page.info.height, fixture.displayed.height, 0.05);
      expect(page.info.rotation).toBe(fixture.rotation);
      expectNear(page.info.cropBox.x, fixture.crop.x, 0.05);
      expectNear(page.info.cropBox.y, fixture.crop.y, 0.05);
      expectNear(page.info.cropBox.width, fixture.crop.width, 0.05);
      expectNear(page.info.cropBox.height, fixture.crop.height, 0.05);

      const expectedText = formulaTextBox(
        fixture.crop,
        fixture.rotation,
        fixture.anchor,
        ANCHOR_TEXT_WIDTH,
      );
      const line = doc.lines.find((item) => item.text.includes(ANCHOR_TEXT));
      expect(line).toBeDefined();
      if (!line) return;
      expectDisplayed(line.box, expectedText);

      const placed = resolvePlacementFields(
        [
          {
            signer_id: 'signer-1',
            kind: 'signature',
            box: {
              page: 1,
              x: COORDINATE.x,
              y: COORDINATE.y,
              width: COORDINATE.w,
              height: COORDINATE.h,
            },
          },
        ],
        doc,
      );
      expect(placed.issues).toEqual([]);
      const field = placed.resolved[0];
      expect(field).toBeDefined();
      if (!field) return;
      expectDisplayed(field.box, COORDINATE);

      const expectedPdf = pdfRectFromDisplayed(fixture.crop, fixture.rotation, COORDINATE);
      const before = await listPathBounds(fixture.bytes);
      const stamped = await stampDisplayedBoxes(fixture.bytes, [
        { page: 1, viewport: page.viewport, box: COORDINATE },
      ]);
      const after = await listPathBounds(stamped);
      expect(countNear(after, expectedPdf)).toBeGreaterThan(countNear(before, expectedPdf));
      const hit = after.find(
        (bound) =>
          Math.abs(bound.x - expectedPdf.x) <= SLOP_PT &&
          Math.abs(bound.y - expectedPdf.y) <= SLOP_PT,
      );
      expect(hit).toBeDefined();
      if (!hit) return;
      expectRect(hit, expectedPdf);

      if (fixture.rotation === 0 && fixture.crop.x === 0 && fixture.crop.y === 0) {
        const stored = displayedBoxToStored(COORDINATE, {
          width: page.info.width,
          height: page.info.height,
        });
        const back = storedBoxToDisplayed(
          { x: stored.x, y: stored.y, width: stored.width, height: stored.height },
          { width: page.info.width, height: page.info.height },
        );
        expectNear(back.x, COORDINATE.x);
        expectNear(back.y, COORDINATE.y);
        expectNear(back.w, COORDINATE.w);
        expectNear(back.h, COORDINATE.h);
        expectNear(hit.y, flipYForPdfLib(stored.y, stored.height, page.info.height), 0.1);
      }
    },
  );

  it('places an anchor to the right, then a positive later occurrence', async () => {
    const letter = await buildLetter();
    const doc = await loadPdf(letter.bytes);
    const text = formulaTextBox(letter.crop, 0, LETTER_ANCHOR, ANCHOR_TEXT_WIDTH);
    const placed = resolvePlacementFields(
      [
        {
          signer_id: 'signer-1',
          kind: 'signature',
          anchor: { text: ANCHOR_TEXT, dx: 2, dy: 1 },
        },
      ],
      doc,
    );
    const field = placed.resolved[0];
    expect(field).toBeDefined();
    if (!field) return;
    const bottom = text.y + text.h + 3 + 1;
    expectDisplayed(field.box, {
      x: text.x + text.w + 6 + 2,
      y: bottom - 50,
      w: 180,
      h: 50,
    });
    expect(field.source).toBe(`anchor:${ANCHOR_TEXT}#1`);

    const doubled = await loadPdf((await buildDoubleAnchor()).bytes);
    const second = formulaTextBox(
      { x: 0, y: 0, width: LETTER.width, height: LETTER.height },
      0,
      SECOND_ANCHOR,
      ANCHOR_TEXT_WIDTH,
    );
    const nth = resolvePlacementFields(
      [
        {
          signer_id: 'signer-1',
          kind: 'signature',
          anchor: { text: ANCHOR_TEXT, occurrence: 2 },
        },
      ],
      doubled,
    );
    const later = nth.resolved[0];
    expect(later).toBeDefined();
    if (!later) return;
    expect(later.page).toBe(1);
    expectDisplayed(later.box, {
      x: second.x + second.w + 6,
      y: second.y + second.h + 3 - 50,
      w: 180,
      h: 50,
    });
    expect(later.source).toBe(`anchor:${ANCHOR_TEXT}#2`);
    expect(second.y).toBeGreaterThan(text.y);
  });

  it('anchors on /Rotate 180 and 270 use the same right-hand rule', async () => {
    const cases = [
      {
        build: buildRotated180,
        anchor: ROTATED_180_ANCHOR,
        rotation: 180 as const,
      },
      {
        build: buildRotated270,
        anchor: ROTATED_270_ANCHOR,
        rotation: 270 as const,
      },
    ];
    for (const item of cases) {
      const fixture = await item.build();
      const doc = await loadPdf(fixture.bytes);
      const text = formulaTextBox(fixture.crop, item.rotation, item.anchor, ANCHOR_TEXT_WIDTH);
      const placed = resolvePlacementFields(
        [{ signer_id: 'signer-1', kind: 'signature', anchor: { text: ANCHOR_TEXT } }],
        doc,
      );
      expect(placed.issues).toEqual([]);
      const field = placed.resolved[0];
      expect(field).toBeDefined();
      if (!field) return;
      expectDisplayed(field.box, {
        x: text.x + text.w + 6,
        y: text.y + text.h + 3 - 50,
        w: 180,
        h: 50,
      });
      const page = doc.pages[0];
      expect(page).toBeDefined();
      if (!page) return;
      const expectedPdf = pdfRectFromDisplayed(fixture.crop, item.rotation, {
        x: field.box.x,
        y: field.box.y,
        w: field.box.width,
        h: field.box.height,
      });
      const before = await listPathBounds(fixture.bytes);
      const stamped = await stampDisplayedBoxes(fixture.bytes, [
        {
          page: 1,
          viewport: page.viewport,
          box: { x: field.box.x, y: field.box.y, w: field.box.width, h: field.box.height },
        },
      ]);
      const after = await listPathBounds(stamped);
      expect(countNear(after, expectedPdf)).toBeGreaterThan(countNear(before, expectedPdf));
    }
  });

  it('reads a mixed Letter + A4 + Legal document and a non-zero MediaBox', async () => {
    const mixed = await loadPdf((await buildMixed()).bytes);
    expect(mixed.pageCount).toBe(3);
    const sizes = mixed.pages.map((page) => ({
      width: page.info.width,
      height: page.info.height,
    }));
    expect(sizes[0]?.width).toBeCloseTo(LETTER.width, 2);
    expect(sizes[0]?.height).toBeCloseTo(LETTER.height, 2);
    expect(sizes[1]?.width).toBeCloseTo(A4.width, 2);
    expect(sizes[1]?.height).toBeCloseTo(A4.height, 2);
    expect(sizes[2]?.width).toBeCloseTo(LEGAL.width, 2);
    expect(sizes[2]?.height).toBeCloseTo(LEGAL.height, 2);

    const origin = await buildMediaOrigin();
    const doc = await loadPdf(origin.bytes);
    const page = doc.pages[0];
    expect(page).toBeDefined();
    if (!page) return;
    expect(page.info.width).toBeCloseTo(MEDIA_ORIGIN.width, 2);
    expect(page.info.height).toBeCloseTo(MEDIA_ORIGIN.height, 2);
    expect(page.info.mediaBox.x).toBeCloseTo(MEDIA_ORIGIN.x, 2);
    expect(page.info.mediaBox.y).toBeCloseTo(MEDIA_ORIGIN.y, 2);
    const box: DisplayedBox = { x: 36, y: 48, w: 180, h: 50 };
    const expected = pdfRectFromDisplayed(origin.crop, 0, box);
    expectNear(expected.x, 46, 0.05);
    expectNear(expected.y, 622, 0.05);
    const before = await listPathBounds(origin.bytes);
    const stamped = await stampDisplayedBoxes(origin.bytes, [
      { page: 1, viewport: page.viewport, box },
    ]);
    const after = await listPathBounds(stamped);
    expect(countNear(after, expected)).toBeGreaterThan(countNear(before, expected));
  });

  it('groups words into lines and paginates a text cap', async () => {
    const doc = await loadPdf((await buildTwoWords()).bytes);
    expect(doc.lines.map((line) => line.text)).toEqual(['Hello World', 'Below']);
    const words = doc.words.map((word) => word.text);
    expect(words).toEqual(expect.arrayContaining(['Hello', 'World', 'Below']));
    const page = paginatePlacementText(
      Array.from({ length: 2001 }, (_, index) => index),
      0,
    );
    expect(page.slice).toHaveLength(2000);
    expect(page.nextIndex).toBe(2000);
    const line = groupTextLines([
      {
        page: 1,
        text: 'AnchorTarget AnchorTarget',
        box: { x: 10, y: 20, width: 200, height: 12 },
      },
    ])[0];
    expect(line).toBeDefined();
    if (!line) return;
    expect(findAnchorMatches([line], { text: 'AnchorTarget' })).toHaveLength(2);
  });

  it('maps every AcroForm widget and keeps a text widget from becoming a signature', async () => {
    const catalog = await loadPdf((await buildWidgetCatalog()).bytes);
    const byName = new Map(catalog.formFields.map((widget) => [widget.name, widget]));
    const expectWidget = (name: string, type: string, kind: string): void => {
      const widget =
        byName.get(name) ?? catalog.formFields.find((item) => item.name.startsWith(`${name}.`));
      expect(widget).toBeDefined();
      expect(widget?.type).toBe(type);
      expect(widget?.suggested_kind).toBe(kind);
    };
    expectWidget('Notes', 'Text', 'text');
    expectWidget('AgreeBox', 'CheckBox', 'checkbox');
    expectWidget('Choice', 'RadioButton', 'text');
    expectWidget('Go', 'PushButton', 'text');
    expectWidget('City', 'ComboBox', 'text');
    expectWidget('Tags', 'ListBox', 'text');
    expectWidget('SigBlock', 'Signature', 'signature');
    expectWidget('InitialsBlock', 'Text', 'initials');
    expectWidget('DateSigned', 'Text', 'date');
    expectWidget('EmailAddress', 'Text', 'email');
    expectWidget('NameLine', 'Text', 'name');
    expectWidget('checkboxOpt', 'CheckBox', 'checkbox');

    const placed = resolvePlacementFields(
      [
        { signer_id: 'signer-1', form_field: { name: 'Notes' } },
        { signer_id: 'signer-1', form_field: { name: 'SigBlock' } },
      ],
      catalog,
    );
    expect(placed.issues).toEqual([]);
    expect(placed.resolved.map((field) => field.kind)).toEqual(['text', 'signature']);
    expect(placed.resolved[0]?.source).toBe('form_field:Notes');

    const rotated = await loadPdf((await buildAcroFormRotated()).bytes);
    const notes = rotated.formFields.find((widget) => widget.name === 'Notes');
    expect(notes).toBeDefined();
    if (!notes) return;
    const crop = { x: 0, y: 0, width: LETTER.width, height: LETTER.height };
    const expected = enclose([
      displayedPoint(crop, 90, 72, 600),
      displayedPoint(crop, 90, 72 + 180, 600),
      displayedPoint(crop, 90, 72, 600 + 24),
      displayedPoint(crop, 90, 72 + 180, 600 + 24),
    ]);
    expectDisplayed(notes.box, expected);
    expect(rotated.pages[0]?.info.rotation).toBe(90);
    expect(rotated.pages[0]?.info.width).toBeCloseTo(LETTER.height, 2);
    expect(rotated.pages[0]?.info.height).toBeCloseTo(LETTER.width, 2);
  });
});
