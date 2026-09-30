import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { createCanvas, loadImage } from 'canvas';
import { flipYForPdfLib } from '../../envelopes/coord';
import {
  ANCHOR_FONT_SIZE,
  ANCHOR_TEXT,
  buildA4,
  buildAcroForm,
  buildCropBox,
  buildLetter,
  buildRotated,
  type BuiltFixture,
} from '../__fixtures__/build-fixtures';
import { FieldPlacementEngine, MemoryDocumentSource } from '../field-placement.engine';
import { listPathBounds, type PdfRectLike } from '../pdf-document';
import { stopPdfWorker } from '../pdfjs-host';
import { PREVIEW_SCALE } from '../render-preview';
import type { DisplayedBox, PlacementInput } from '../field-placement.types';

const SLOP_PT = 0.5;
/**
 * Helvetica AFM advance of "AnchorTarget" at 12pt (6058 units × 12 / 1000).
 * pdf.js uses these metrics. pdf-lib's `widthOfTextAtSize` is about 1.4pt
 * narrower, so the round-trip compares against the AFM width.
 */
const ANCHOR_ADVANCE_PT = 72.696;
const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__');
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');

const CASES: readonly { name: string; file: string; build: () => Promise<BuiltFixture> }[] = [
  { name: 'letter', file: 'letter.pdf', build: buildLetter },
  { name: 'a4', file: 'a4.pdf', build: buildA4 },
  { name: 'rotated', file: 'rotated-90.pdf', build: buildRotated },
  { name: 'cropbox', file: 'cropbox.pdf', build: buildCropBox },
  { name: 'acroform', file: 'acroform.pdf', build: buildAcroForm },
];

const COORDINATE_BOX: DisplayedBox = { x: 36, y: 48, w: 144, h: 36 };
const ADA = { id: 'ada', name: 'Ada Lovelace' };

function setMcpFlag(enabled: boolean | undefined): void {
  const host = globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: { mcpServer?: boolean } };
  if (enabled === undefined) {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    return;
  }
  host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: enabled };
}

function engineFor(documentId: string, bytes: Uint8Array): FieldPlacementEngine {
  return new FieldPlacementEngine(new MemoryDocumentSource(new Map([[documentId, bytes]])));
}

function displayedOfPdf(
  crop: BuiltFixture['crop'],
  rotation: BuiltFixture['rotation'],
  pdfX: number,
  pdfY: number,
): { x: number; y: number } {
  if (rotation === 90) return { x: pdfY - crop.y, y: pdfX - crop.x };
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

/** Independent of pdf.js: glyph box of horizontal Helvetica on the displayed page. */
function formulaTextBox(fixture: BuiltFixture, textWidth: number): DisplayedBox {
  const { anchor, crop, rotation } = fixture;
  return enclose([
    displayedOfPdf(crop, rotation, anchor.x, anchor.y),
    displayedOfPdf(crop, rotation, anchor.x + textWidth, anchor.y),
    displayedOfPdf(crop, rotation, anchor.x, anchor.y + ANCHOR_FONT_SIZE),
    displayedOfPdf(crop, rotation, anchor.x + textWidth, anchor.y + ANCHOR_FONT_SIZE),
  ]);
}

/** Independent of the engine: displayed box → PDF user-space rect. */
function pdfRectFromDisplayed(
  crop: BuiltFixture['crop'],
  rotation: BuiltFixture['rotation'],
  box: DisplayedBox,
): PdfRectLike {
  if (rotation === 90) {
    return { x: crop.x + box.y, y: crop.y + box.x, width: box.h, height: box.w };
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

function expectBox(actual: DisplayedBox, expected: DisplayedBox, slop = SLOP_PT): void {
  expectNear(actual.x, expected.x, slop);
  expectNear(actual.y, expected.y, slop);
  expectNear(actual.w, expected.w, slop);
  expectNear(actual.h, expected.h, slop);
}

function expectRect(actual: PdfRectLike, expected: PdfRectLike, slop = SLOP_PT): void {
  expectNear(actual.x, expected.x, slop);
  expectNear(actual.y, expected.y, slop);
  expectNear(actual.width, expected.width, slop);
  expectNear(actual.height, expected.height, slop);
}

function countNear(bounds: readonly PdfRectLike[], expected: PdfRectLike): number {
  return bounds.filter(
    (bound) =>
      Math.abs(bound.x - expected.x) <= SLOP_PT &&
      Math.abs(bound.y - expected.y) <= SLOP_PT &&
      Math.abs(bound.width - expected.width) <= SLOP_PT &&
      Math.abs(bound.height - expected.height) <= SLOP_PT,
  ).length;
}

function labelSample(box: DisplayedBox): { x: number; y: number } {
  const x = box.x * PREVIEW_SCALE;
  const y = box.y * PREVIEW_SCALE;
  const fontSize = Math.max(12, Math.round(8 * PREVIEW_SCALE));
  const labelH = fontSize + 8;
  const labelY = y >= labelH + 2 ? y - labelH - 2 : y + 2;
  return { x: x + 2, y: labelY + 2 };
}

async function rgbaAt(
  png: Buffer,
  point: { x: number; y: number },
): Promise<{ r: number; g: number; b: number }> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixel = ctx.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
  const r = pixel[0];
  const g = pixel[1];
  const b = pixel[2];
  if (r === undefined || g === undefined || b === undefined) throw new Error('empty pixel');
  return { r, g, b };
}

function expectRgb(pixel: { r: number; g: number; b: number }, hex: string): void {
  const value = Number.parseInt(hex.slice(1), 16);
  expect(Math.abs(pixel.r - ((value >> 16) & 255))).toBeLessThanOrEqual(8);
  expect(Math.abs(pixel.g - ((value >> 8) & 255))).toBeLessThanOrEqual(8);
  expect(Math.abs(pixel.b - (value & 255))).toBeLessThanOrEqual(8);
}

afterAll(async () => {
  await stopPdfWorker();
});

describe('field placement engine', () => {
  jest.setTimeout(60_000);

  beforeEach(() => {
    setMcpFlag(true);
  });

  afterEach(() => {
    setMcpFlag(undefined);
  });

  it.each(CASES)(
    '$name: coordinate and anchor land on the displayed page and in the stamped PDF',
    async ({ name, build }) => {
      const fixture = await build();
      const documentId = name;
      const engine = engineFor(documentId, fixture.bytes);
      const expectedText = formulaTextBox(fixture, ANCHOR_ADVANCE_PT);
      const inspection = await engine.inspectDocument(documentId);
      const page = inspection.pages[0];
      expect(page).toBeDefined();
      if (!page) return;
      expect(inspection.pageCount).toBe(1);
      expectNear(page.width, fixture.displayed.width, 0.05);
      expectNear(page.height, fixture.displayed.height, 0.05);
      expect(page.rotation).toBe(fixture.rotation);
      expect(page.mediaBox.width).toBeGreaterThan(0);
      expect(page.mediaBox.height).toBeGreaterThan(0);
      expectNear(page.cropBox.x, fixture.crop.x, 0.05);
      expectNear(page.cropBox.y, fixture.crop.y, 0.05);
      expectNear(page.cropBox.width, fixture.crop.width, 0.05);
      expectNear(page.cropBox.height, fixture.crop.height, 0.05);

      const run = inspection.textRuns.find((item) => item.text.includes(ANCHOR_TEXT));
      expect(run).toBeDefined();
      if (!run) return;
      expectBox(run, expectedText);

      const placedAt = await engine.placeFields(documentId, [
        { type: 'signature', signer: ADA, page: 1, ...COORDINATE_BOX },
      ]);
      expect(placedAt.errors).toEqual([]);
      const coordinate = placedAt.fields[0];
      expect(coordinate).toBeDefined();
      if (!coordinate) return;
      expectBox(coordinate.box, COORDINATE_BOX);
      expect(coordinate.kind).toBe('signature');
      expect(coordinate.page).toBe(1);
      const report = placedAt.validation.fields.find((field) => field.id === coordinate.id);
      expect(report?.nearestText?.text).toContain(ANCHOR_TEXT);
      expectBox(report?.box ?? coordinate.box, coordinate.box, 0.01);

      const expectedPdf = pdfRectFromDisplayed(fixture.crop, fixture.rotation, coordinate.box);
      const before = await listPathBounds(fixture.bytes);
      const stamped = await engine.stampFieldProof(documentId, [coordinate]);
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
        expectNear(hit.x, coordinate.x * page.width, 0.05);
        expectNear(hit.y, flipYForPdfLib(coordinate.y, coordinate.height, page.height), 0.05);
        expectNear(hit.width, coordinate.width * page.width, 0.05);
        expectNear(hit.height, coordinate.height * page.height, 0.05);
      }

      const anchorBox: DisplayedBox = {
        x: expectedText.x + expectedText.w + 6,
        y: expectedText.y,
        w: 120,
        h: 36,
      };
      const placedAnchor = await engine.placeFields(documentId, [
        {
          type: 'signature',
          signer: ADA,
          anchor: { text: ANCHOR_TEXT, position: 'after', offset: { x: 6, y: 0 } },
          w: 120,
          h: 36,
        },
      ]);
      expect(placedAnchor.errors).toEqual([]);
      const anchored = placedAnchor.fields[0];
      expect(anchored).toBeDefined();
      if (!anchored) return;
      expectBox(anchored.box, anchorBox);
      const anchorPdf = pdfRectFromDisplayed(fixture.crop, fixture.rotation, anchored.box);
      const anchorStamp = await engine.stampFieldProof(documentId, [anchored]);
      const anchorBounds = await listPathBounds(anchorStamp);
      expect(countNear(anchorBounds, anchorPdf)).toBeGreaterThan(countNear(before, anchorPdf));
      const anchorHit = anchorBounds.find((bound) => Math.abs(bound.x - anchorPdf.x) <= SLOP_PT);
      expect(anchorHit).toBeDefined();
      if (anchorHit) expectRect(anchorHit, anchorPdf);

      const sameSpot = await engine.placeFields(documentId, [
        { type: 'signature', signer: ADA, page: 1, ...anchorBox },
      ]);
      const retargeted = sameSpot.fields[0];
      expect(retargeted).toBeDefined();
      if (retargeted) expectBox(retargeted.box, anchored.box);
    },
  );

  it('reads an AcroForm widget as a displayed box and places on its name', async () => {
    const fixture = await buildAcroForm();
    const engine = engineFor('form', fixture.bytes);
    const inspection = await engine.inspectDocument('form');
    const signerName = inspection.acroFormFields.find((field) => field.name === 'SignerName');
    const agree = inspection.acroFormFields.find((field) => field.name === 'AgreeBox');
    expect(signerName?.fieldType).toBe('Tx');
    expect(agree?.fieldType).toBe('Btn');
    if (!signerName || !agree) throw new Error('widgets missing');
    expectBox(signerName, { x: 100, y: 268, w: 180, h: 24 });
    expectBox(agree, { x: 100, y: 314, w: 18, h: 18 });

    const placed = await engine.placeFields('form', [
      { type: 'signature', signer: ADA, acroformField: 'SignerName' },
      { type: 'checkbox', signer: ADA, acroformField: 'AgreeBox' },
    ]);
    expect(placed.errors).toEqual([]);
    const signature = placed.fields.find((field) => field.kind === 'signature');
    const checkbox = placed.fields.find((field) => field.kind === 'checkbox');
    if (!signature || !checkbox) throw new Error('fields missing');
    expectBox(signature.box, signerName);
    expectBox(checkbox.box, agree);

    const byPoint = await engine.placeFields('form', [
      {
        type: 'signature',
        signer: ADA,
        page: 1,
        x: signerName.x,
        y: signerName.y,
        w: signerName.w,
        h: signerName.h,
      },
    ]);
    const pointed = byPoint.fields[0];
    if (!pointed) throw new Error('point placement missing');
    expectBox(pointed.box, signature.box);

    const before = await listPathBounds(fixture.bytes);
    const stamped = await engine.stampFieldProof('form', [signature]);
    const after = await listPathBounds(stamped);
    const expected = pdfRectFromDisplayed(fixture.crop, fixture.rotation, signature.box);
    expect(countNear(after, expected)).toBeGreaterThan(countNear(before, expected));
  });

  it('stores every kind, and name as text linked to name', async () => {
    const fixture = await buildLetter();
    const engine = engineFor('kinds', fixture.bytes);
    const inputs: PlacementInput[] = [
      { type: 'signature', signer: ADA, page: 1, x: 40, y: 500, w: 160, h: 40 },
      { type: 'initials', signer: ADA, page: 1, x: 220, y: 500, w: 80, h: 36 },
      { type: 'date', signer: ADA, page: 1, x: 320, y: 500, w: 120, h: 20 },
      { type: 'text', signer: ADA, page: 1, x: 40, y: 560, w: 160, h: 20 },
      { type: 'checkbox', signer: ADA, page: 1, x: 220, y: 560, w: 18, h: 18 },
      { type: 'email', signer: ADA, page: 1, x: 260, y: 560, w: 180, h: 20 },
      { type: 'name', signer: ADA, page: 1, x: 40, y: 620, w: 160, h: 20 },
    ];
    const placed = await engine.placeFields('kinds', inputs);
    expect(placed.errors).toEqual([]);
    expect(placed.validation.ok).toBe(true);
    expect(placed.fields.map((field) => field.kind)).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
      'text',
    ]);
    expect(placed.fields.map((field) => field.link_id)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      'name',
    ]);
    const name = placed.fields[6];
    if (!name) throw new Error('name field missing');
    expectBox(name.box, { x: 40, y: 620, w: 160, h: 20 });
  });

  it('uses the seal default size when an anchor omits w and h', async () => {
    const fixture = await buildLetter();
    const engine = engineFor('defaults', fixture.bytes);
    const placed = await engine.placeFields('defaults', [
      {
        type: 'signature',
        signer: ADA,
        anchor: { text: ANCHOR_TEXT, position: 'after', offset: { x: 6, y: 0 } },
      },
    ]);
    const field = placed.fields[0];
    expect(field).toBeDefined();
    if (!field) return;
    expectNear(field.width, 0.25, 0.0001);
    expectNear(field.height, 0.06, 0.0001);
    expect(placed.validation.errors.map((issue) => issue.code)).not.toContain('out_of_bounds');
  });

  it('reports every placement error code, with the box and the nearest text', async () => {
    const fixture = await buildLetter();
    const engine = engineFor('invalid', fixture.bytes);
    const placed = await engine.placeFields('invalid', [
      { type: 'signature', signer: ADA, page: 1, x: 40, y: 500, w: 160, h: 40 },
      {
        type: 'signature',
        signer: { id: 'bob', name: 'Bob' },
        page: 1,
        x: 560,
        y: 40,
        w: 80,
        h: 40,
      },
      { type: 'text', signer: ADA, page: 1, x: 40, y: 640, w: 10, h: 8 },
      { type: 'checkbox', signer: ADA, page: 1, x: 300, y: 500, w: 40, h: 20 },
      { type: 'checkbox', signer: ADA, page: 1, x: 310, y: 505, w: 40, h: 20 },
      {
        type: 'initials',
        signer: { id: 'cara', name: 'Cara' },
        page: 1,
        x: 40,
        y: 560,
        w: 40,
        h: 20,
      },
      { type: 'text', signer: ADA, page: 1, x: 72, y: 78, w: 80, h: 16 },
      {
        type: 'signature',
        signer: { id: 'dana', name: 'Dana' },
        anchor: { text: ANCHOR_TEXT, occurrence: 2, position: 'after' },
      },
      {
        type: 'signature',
        signer: { id: 'erin', name: 'Erin' },
        anchor: { text: 'MissingAnchor', position: 'below' },
      },
      { type: 'signature', signer: { id: 'frank', name: 'Frank' }, acroformField: 'Nope' },
      {
        type: 'signature',
        signer: { id: 'gina', name: 'Gina' },
        page: 9,
        x: 40,
        y: 40,
        w: 160,
        h: 40,
      },
    ]);
    const codes = [...placed.errors, ...placed.validation.errors].map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'out_of_bounds',
        'too_small',
        'overlap',
        'missing_signature',
        'anchor_not_found',
        'page_not_found',
      ]),
    );
    expect(placed.validation.warnings.map((issue) => issue.code)).toContain('covers_text');
    const bounded = placed.validation.errors.find((issue) => issue.code === 'out_of_bounds');
    expect(bounded?.box).toEqual(
      expect.objectContaining({ x: expect.any(Number), w: expect.any(Number) }),
    );
    const good = placed.validation.fields.find(
      (field) => field.signerId === 'ada' && field.kind === 'signature',
    );
    expect(good?.nearestText?.text).toBe(ANCHOR_TEXT);
    expect(good?.box.w).toBeGreaterThan(100);
    expect(
      placed.validation.errors.some(
        (issue) => issue.code === 'missing_signature' && issue.signerId === 'cara',
      ),
    ).toBe(true);
    expect(placed.errors.filter((issue) => issue.code === 'anchor_not_found')).toHaveLength(3);
    expect(placed.errors.some((issue) => issue.code === 'page_not_found' && issue.page === 9)).toBe(
      true,
    );
    expect(placed.validation.ok).toBe(false);
  });

  it('paints each signer color and moves the box on updateField', async () => {
    const fixture = await buildLetter();
    const engine = engineFor('preview', fixture.bytes);
    const placed = await engine.placeFields('preview', [
      {
        type: 'signature',
        signer: { id: 'ada', name: 'Ada', color: '#FF00AA' },
        page: 1,
        x: 40,
        y: 400,
        w: 160,
        h: 40,
      },
      {
        type: 'signature',
        signer: { id: 'grace', name: 'Grace', color: '#2563EB' },
        page: 1,
        x: 40,
        y: 200,
        w: 160,
        h: 40,
      },
    ]);
    expect(placed.validation.ok).toBe(true);
    const ada = placed.fields.find((field) => field.signer_id === 'ada');
    const grace = placed.fields.find((field) => field.signer_id === 'grace');
    if (!ada || !grace) throw new Error('preview fields missing');
    const [page] = await engine.renderPreview('preview', placed.fields);
    if (!page) throw new Error('preview missing');
    expect(page.png.subarray(0, 4).toString('hex')).toBe('89504e47');
    expectRgb(await rgbaAt(page.png, labelSample(ada.box)), '#FF00AA');
    expectRgb(await rgbaAt(page.png, labelSample(grace.box)), '#2563EB');

    const updated = await engine.updateField(ada.id, { x: 300 });
    const moved = updated.find((field) => field.id === ada.id);
    if (!moved) throw new Error('updated field missing');
    expect(moved.box.x).toBeGreaterThan(250);
    expect(updated).toHaveLength(2);
    const [again] = await engine.renderPreview('preview', updated);
    if (!again) throw new Error('second preview missing');
    const vacated = await rgbaAt(again.png, labelSample(ada.box));
    expect(vacated.r).toBeGreaterThan(250);
    expect(vacated.g).toBeGreaterThan(250);
    expect(vacated.b).toBeGreaterThan(250);
    expectRgb(await rgbaAt(again.png, labelSample(moved.box)), '#FF00AA');
    expectRgb(await rgbaAt(again.png, labelSample(grace.box)), '#2563EB');
  });

  it('assigns the editor palette when a signer has no color', async () => {
    const fixture = await buildLetter();
    const engine = engineFor('palette', fixture.bytes);
    const placed = await engine.placeFields('palette', [
      {
        type: 'signature',
        signer: { id: 'ada', name: 'Ada' },
        page: 1,
        x: 40,
        y: 500,
        w: 160,
        h: 40,
      },
    ]);
    expect(placed.fields[0]?.signer_color).toBe('#F472B6');
  });

  it('keeps the committed fixtures and sample previews', async () => {
    const letter = readFileSync(path.join(FIXTURE_DIR, 'letter.pdf'));
    expect(letter.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    const engine = engineFor('committed-letter', new Uint8Array(letter));
    const inspection = await engine.inspectDocument('committed-letter');
    expect(inspection.pages[0]?.width).toBeCloseTo(612, 0);
    expect(inspection.pages[0]?.height).toBeCloseTo(792, 0);
    expect(inspection.textRuns.some((run) => run.text.includes(ANCHOR_TEXT))).toBe(true);

    const form = readFileSync(path.join(FIXTURE_DIR, 'acroform.pdf'));
    const formEngine = engineFor('committed-form', new Uint8Array(form));
    const formInspection = await formEngine.inspectDocument('committed-form');
    expect(formInspection.acroFormFields.map((field) => field.name).sort()).toEqual([
      'AgreeBox',
      'SignerName',
    ]);

    for (const name of ['letter-preview.png', 'rotated-preview.png']) {
      const png = readFileSync(path.join(ARTIFACT_DIR, name));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png.length).toBeGreaterThan(1000);
    }
  });
});

describe('field placement engine while mcpServer is off', () => {
  afterEach(() => {
    setMcpFlag(undefined);
  });

  it('answers not_found', async () => {
    setMcpFlag(undefined);
    const engine = engineFor('dark', new Uint8Array([0x25, 0x50, 0x44, 0x46]));
    await expect(engine.inspectDocument('dark')).rejects.toBeInstanceOf(NotFoundException);
    try {
      await engine.placeFields('dark', []);
      throw new Error('placeFields should have refused');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const response = (err as NotFoundException).getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' && response !== null && 'message' in response
            ? response.message
            : undefined;
      expect(message).toBe('not_found');
    }
  });
});

async function samplePreviews(): Promise<{ letter: Buffer; rotated: Buffer }> {
  setMcpFlag(true);
  const letter = await buildLetter();
  const letterEngine = engineFor('sample-letter', letter.bytes);
  const letterPlaced = await letterEngine.placeFields('sample-letter', [
    {
      type: 'signature',
      signer: { id: 'ada', name: 'Ada', color: '#FF00AA' },
      page: 1,
      x: 72,
      y: 180,
      w: 180,
      h: 48,
    },
    {
      type: 'initials',
      signer: { id: 'grace', name: 'Grace', color: '#2563EB' },
      page: 1,
      x: 72,
      y: 280,
      w: 80,
      h: 36,
    },
    {
      type: 'date',
      signer: { id: 'ada', name: 'Ada', color: '#FF00AA' },
      page: 1,
      x: 280,
      y: 180,
      w: 120,
      h: 24,
    },
  ]);
  const letterPage = (await letterEngine.renderPreview('sample-letter', letterPlaced.fields))[0];
  if (!letterPage) throw new Error('letter preview missing');

  const rotated = await buildRotated();
  const rotatedEngine = engineFor('sample-rotated', rotated.bytes);
  const rotatedPlaced = await rotatedEngine.placeFields('sample-rotated', [
    {
      type: 'signature',
      signer: { id: 'ada', name: 'Ada', color: '#10B981' },
      anchor: { text: ANCHOR_TEXT, position: 'after', offset: { x: 8, y: 0 } },
      w: 140,
      h: 40,
    },
  ]);
  const rotatedPage = (
    await rotatedEngine.renderPreview('sample-rotated', rotatedPlaced.fields)
  )[0];
  if (!rotatedPage) throw new Error('rotated preview missing');
  setMcpFlag(undefined);
  return { letter: letterPage.png, rotated: rotatedPage.png };
}

if (process.env.WRITE_FIELD_PLACEMENT_ARTIFACTS === '1') {
  describe('write field-placement artifacts', () => {
    jest.setTimeout(60_000);

    it('writes pdf fixtures and the two sample previews', async () => {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      for (const item of CASES) {
        const built = await item.build();
        writeFileSync(path.join(FIXTURE_DIR, item.file), built.bytes);
      }
      const previews = await samplePreviews();
      writeFileSync(path.join(ARTIFACT_DIR, 'letter-preview.png'), previews.letter);
      writeFileSync(path.join(ARTIFACT_DIR, 'rotated-preview.png'), previews.rotated);
    });
  });
}
