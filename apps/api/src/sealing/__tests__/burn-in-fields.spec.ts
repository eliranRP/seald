import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import {
  burnInField,
  defaultWidth,
  defaultHeight,
  type BurnInAssets,
  type BurnInField,
} from '../burn-in-fields';

// Page dimensions used across all tests (A4-ish).
const PW = 596;
const PH = 842;

/** Build a fresh page + assets for each test. */
async function createTestPage(): Promise<{
  doc: PDFDocument;
  page: PDFPage;
  assets: BurnInAssets;
}> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PW, PH]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Embed a tiny 1x1 white PNG to use as signature / initials image.
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg==',
    'base64',
  );
  const sigImg = await doc.embedPng(pngBytes);
  const initialsImg = await doc.embedPng(pngBytes);

  return {
    doc,
    page,
    assets: { sigImg, initialsImg, helvetica, helveticaBold },
  };
}

// ---------------------------------------------------------------------------
// defaultWidth / defaultHeight
// ---------------------------------------------------------------------------
describe('defaultWidth', () => {
  it('returns 0.25 for signature', () => expect(defaultWidth('signature')).toBe(0.25));
  it('returns 0.08 for initials', () => expect(defaultWidth('initials')).toBe(0.08));
  it('returns 0.03 for checkbox', () => expect(defaultWidth('checkbox')).toBe(0.03));
  it('returns 0.2 for text', () => expect(defaultWidth('text')).toBe(0.2));
  it('returns 0.2 for date', () => expect(defaultWidth('date')).toBe(0.2));
  it('returns 0.2 for email', () => expect(defaultWidth('email')).toBe(0.2));
  it('returns 0.2 for unknown kind', () => expect(defaultWidth('whatever')).toBe(0.2));
});

describe('defaultHeight', () => {
  it('returns 0.06 for signature', () => expect(defaultHeight('signature')).toBe(0.06));
  it('returns 0.04 for initials', () => expect(defaultHeight('initials')).toBe(0.04));
  it('returns 0.03 for checkbox', () => expect(defaultHeight('checkbox')).toBe(0.03));
  it('returns 0.03 for text', () => expect(defaultHeight('text')).toBe(0.03));
  it('returns 0.03 for unknown kind', () => expect(defaultHeight('unknown')).toBe(0.03));
});

// ---------------------------------------------------------------------------
// burnInField
// ---------------------------------------------------------------------------
describe('burnInField', () => {
  let page: PDFPage;
  let assets: BurnInAssets;

  beforeEach(async () => {
    ({ page, assets } = await createTestPage());
  });

  // ---- coordinate transform ------------------------------------------------
  describe('coordinate transform', () => {
    it('places signature image at the correct PDF coordinates', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');

      const f: BurnInField = { kind: 'signature', x: 0.1, y: 0.2, width: 0.3, height: 0.06 };
      burnInField(page, f, assets);

      const w = 0.3 * PW; // 178.8
      const h = 0.06 * PH; // 50.52
      const cx = 0.1 * PW + w / 2;
      const cy = PH - 0.2 * PH - h / 2;

      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      const opts = drawImageSpy.mock.calls[0]![1]!;
      expect(opts.x).toBeCloseTo(cx - w / 2, 5);
      expect(opts.y).toBeCloseTo(cy - h / 2, 5);
      expect(opts.width).toBeCloseTo(w, 5);
      expect(opts.height).toBeCloseTo(h, 5);
    });
  });

  // ---- signature rendering -------------------------------------------------
  describe('signature rendering', () => {
    it('draws sigImg filling the field box', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      const f: BurnInField = { kind: 'signature', x: 0.5, y: 0.5, width: 0.25, height: 0.06 };
      burnInField(page, f, assets);

      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      expect(drawImageSpy).toHaveBeenCalledWith(
        assets.sigImg,
        expect.objectContaining({
          width: expect.closeTo(0.25 * PW, 5),
          height: expect.closeTo(0.06 * PH, 5),
        }),
      );
    });

    it('does nothing when sigImg is null', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      const nullAssets = { ...assets, sigImg: null };
      burnInField(page, { kind: 'signature', x: 0.1, y: 0.1 }, nullAssets);
      expect(drawImageSpy).not.toHaveBeenCalled();
    });
  });

  // ---- initials rendering --------------------------------------------------
  describe('initials rendering', () => {
    it('draws initialsImg filling the field box', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      const f: BurnInField = { kind: 'initials', x: 0.3, y: 0.4, width: 0.08, height: 0.04 };
      burnInField(page, f, assets);

      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      expect(drawImageSpy).toHaveBeenCalledWith(
        assets.initialsImg,
        expect.objectContaining({
          width: expect.closeTo(0.08 * PW, 5),
          height: expect.closeTo(0.04 * PH, 5),
        }),
      );
    });

    it('does nothing when initialsImg is null', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      const nullAssets = { ...assets, initialsImg: null };
      burnInField(page, { kind: 'initials', x: 0.1, y: 0.1 }, nullAssets);
      expect(drawImageSpy).not.toHaveBeenCalled();
    });
  });

  // ---- checkbox rendering --------------------------------------------------
  describe('checkbox rendering', () => {
    it('draws a rectangle for any checkbox', () => {
      const drawRectSpy = jest.spyOn(page, 'drawRectangle');
      burnInField(page, { kind: 'checkbox', x: 0.1, y: 0.1, value_boolean: false }, assets);

      expect(drawRectSpy).toHaveBeenCalledTimes(1);
      expect(drawRectSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 10,
          height: 10,
          borderWidth: 0.5,
        }),
      );
    });

    it('draws rectangle at left-aligned position with 22pt padding', () => {
      const drawRectSpy = jest.spyOn(page, 'drawRectangle');
      const f: BurnInField = { kind: 'checkbox', x: 0.1, y: 0.2, width: 0.03, height: 0.03 };
      burnInField(page, f, assets);

      const w = 0.03 * PW;
      const cx = 0.1 * PW + w / 2;
      const expectedCbX = cx - w / 2 + 22;
      const opts = drawRectSpy.mock.calls[0]![0]!;
      expect(opts.x).toBeCloseTo(expectedCbX, 5);
    });

    it('draws checkmark lines when value_boolean is true', () => {
      const drawLineSpy = jest.spyOn(page, 'drawLine');
      burnInField(page, { kind: 'checkbox', x: 0.1, y: 0.1, value_boolean: true }, assets);
      expect(drawLineSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT draw checkmark lines when value_boolean is false', () => {
      const drawLineSpy = jest.spyOn(page, 'drawLine');
      burnInField(page, { kind: 'checkbox', x: 0.1, y: 0.1, value_boolean: false }, assets);
      expect(drawLineSpy).not.toHaveBeenCalled();
    });

    it('does NOT draw checkmark lines when value_boolean is null', () => {
      const drawLineSpy = jest.spyOn(page, 'drawLine');
      burnInField(page, { kind: 'checkbox', x: 0.1, y: 0.1, value_boolean: null }, assets);
      expect(drawLineSpy).not.toHaveBeenCalled();
    });

    it('vertically centers the checkbox in the field box', () => {
      const drawRectSpy = jest.spyOn(page, 'drawRectangle');
      const f: BurnInField = { kind: 'checkbox', x: 0.2, y: 0.3, width: 0.03, height: 0.03 };
      burnInField(page, f, assets);

      const h = 0.03 * PH;
      const cy = PH - 0.3 * PH - h / 2;
      const expectedCbY = cy - 10 / 2; // cbSize / 2
      const opts = drawRectSpy.mock.calls[0]![0]!;
      expect(opts.y).toBeCloseTo(expectedCbY, 5);
    });
  });

  // ---- text / date / email rendering ---------------------------------------
  describe('text/date/email rendering', () => {
    it('draws text left-aligned with 22pt padding', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      const f: BurnInField = {
        kind: 'text',
        x: 0.1,
        y: 0.2,
        width: 0.2,
        height: 0.03,
        value_text: 'hello world',
      };
      burnInField(page, f, assets);

      expect(drawTextSpy).toHaveBeenCalledTimes(1);
      const w = 0.2 * PW;
      const cx = 0.1 * PW + w / 2;
      const expectedX = cx - w / 2 + 22;
      const opts = drawTextSpy.mock.calls[0]![1]!;
      expect(opts.x).toBeCloseTo(expectedX, 5);
    });

    it('uses 12pt Helvetica', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      burnInField(page, { kind: 'text', x: 0.1, y: 0.1, value_text: 'test' }, assets);

      const opts = drawTextSpy.mock.calls[0]![1]!;
      expect(opts.size).toBe(12);
      expect(opts.font).toBe(assets.helvetica);
    });

    it('vertically centers text in the field box', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      const f: BurnInField = {
        kind: 'date',
        x: 0.15,
        y: 0.25,
        width: 0.2,
        height: 0.03,
        value_text: '2026-05-06',
      };
      burnInField(page, f, assets);

      const h = 0.03 * PH;
      const cy = PH - 0.25 * PH - h / 2;
      const textHeight = assets.helvetica.heightAtSize(12);
      const expectedY = cy - textHeight / 2;
      const opts = drawTextSpy.mock.calls[0]![1]!;
      expect(opts.y).toBeCloseTo(expectedY, 5);
    });

    it('renders empty string when value_text is null', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      burnInField(page, { kind: 'email', x: 0.1, y: 0.1, value_text: null }, assets);
      expect(drawTextSpy).toHaveBeenCalledWith('', expect.anything());
    });

    it('renders empty string when value_text is undefined', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      burnInField(page, { kind: 'text', x: 0.1, y: 0.1 }, assets);
      expect(drawTextSpy).toHaveBeenCalledWith('', expect.anything());
    });

    it('works with kind=email the same way as text', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      burnInField(page, { kind: 'email', x: 0.1, y: 0.1, value_text: 'a@b.com' }, assets);
      expect(drawTextSpy).toHaveBeenCalledWith('a@b.com', expect.anything());
    });
  });

  // ---- default dimensions when width/height omitted ------------------------
  describe('uses default dimensions when width/height are omitted', () => {
    it('signature uses default 0.25 x 0.06', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      burnInField(page, { kind: 'signature', x: 0.1, y: 0.1 }, assets);

      const opts = drawImageSpy.mock.calls[0]![1]!;
      expect(opts.width).toBeCloseTo(0.25 * PW, 5);
      expect(opts.height).toBeCloseTo(0.06 * PH, 5);
    });

    it('initials uses default 0.08 x 0.04', () => {
      const drawImageSpy = jest.spyOn(page, 'drawImage');
      burnInField(page, { kind: 'initials', x: 0.1, y: 0.1 }, assets);

      const opts = drawImageSpy.mock.calls[0]![1]!;
      expect(opts.width).toBeCloseTo(0.08 * PW, 5);
      expect(opts.height).toBeCloseTo(0.04 * PH, 5);
    });

    it('checkbox uses default 0.03 x 0.03', () => {
      const drawRectSpy = jest.spyOn(page, 'drawRectangle');
      burnInField(page, { kind: 'checkbox', x: 0.1, y: 0.1, value_boolean: false }, assets);

      // Checkbox always draws a 10pt square, but the field box uses defaults
      // Verify the positioning derives from default dimensions
      const w = 0.03 * PW;
      const cx = 0.1 * PW + w / 2;
      const expectedCbX = cx - w / 2 + 22;
      const opts = drawRectSpy.mock.calls[0]![0]!;
      expect(opts.x).toBeCloseTo(expectedCbX, 5);
    });

    it('handles null width/height same as undefined', () => {
      const drawTextSpy = jest.spyOn(page, 'drawText');
      burnInField(
        page,
        { kind: 'text', x: 0.1, y: 0.1, width: null, height: null, value_text: 'hi' },
        assets,
      );

      const w = defaultWidth('text') * PW;
      const cx = 0.1 * PW + w / 2;
      const expectedX = cx - w / 2 + 22;
      const opts = drawTextSpy.mock.calls[0]![1]!;
      expect(opts.x).toBeCloseTo(expectedX, 5);
    });
  });
});
