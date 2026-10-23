import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { burnInField, type BurnInAssets, type BurnInField } from '../burn-in-fields';

const PW = 600;
const PH = 800;
const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

async function setup(): Promise<{ page: PDFPage; assets: BurnInAssets }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PW, PH]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  return {
    page,
    assets: { sigImg: null, initialsImg: null, helvetica, helveticaBold: helvetica },
  };
}

interface Drawn {
  readonly text: Array<{ text: string; x: number; y: number; size: number }>;
  readonly circles: Array<{ x: number; y: number; size: number; filled: boolean }>;
}

/** Burn one field in and report what was drawn (a per-kind snapshot). */
async function drawn(f: Omit<BurnInField, 'x' | 'y'>): Promise<Drawn> {
  const { page, assets } = await setup();
  const text: Drawn['text'] = [];
  const circles: Drawn['circles'] = [];
  const drawText = page.drawText.bind(page);
  jest.spyOn(page, 'drawText').mockImplementation((t, o) => {
    text.push({ text: t, x: o?.x ?? 0, y: o?.y ?? 0, size: o?.size ?? 0 });
    drawText(t, o);
    return undefined as never;
  });
  jest.spyOn(page, 'drawCircle').mockImplementation((o) => {
    circles.push({
      x: o?.x ?? 0,
      y: o?.y ?? 0,
      size: o?.size ?? 0,
      filled: o?.color !== undefined,
    });
    return undefined as never;
  });
  burnInField(page, { x: 0.1, y: 0.2, width: 0.3, height: 0.04, ...f }, assets);
  return { text, circles };
}

describe('burnInField (WP-07 kinds)', () => {
  // Box: x 60..240, y(top) 160..192 -> centre y 800-176 = 624; text x = 60 + 22 = 82.
  it('name draws its text at the legacy 12pt', async () => {
    const out = await drawn({ kind: 'name', value_text: 'Ada Lovelace', meta: {} });
    expect(out.text).toEqual([{ text: 'Ada Lovelace', x: 82, y: expect.any(Number), size: 12 }]);
    expect(out.circles).toEqual([]);
  });

  it('number is formatted per meta.format', async () => {
    const out = await drawn({
      kind: 'number',
      value_text: '1234567.5',
      meta: { format: 'thousands_fixed2' },
    });
    expect(out.text.map((t) => t.text)).toEqual(['1,234,567.50']);
  });

  it('number without a format draws the stored text', async () => {
    const out = await drawn({ kind: 'number', value_text: '42', meta: {} });
    expect(out.text.map((t) => t.text)).toEqual(['42']);
  });

  it('dropdown draws the selected option label', async () => {
    const out = await drawn({
      kind: 'dropdown',
      value_text: 'l',
      meta: { options: OPTIONS, font_size: 16 },
    });
    expect(out.text).toEqual([{ text: 'Large', x: 82, y: expect.any(Number), size: 16 }]);
  });

  it('dropdown with no selection draws an empty string', async () => {
    const out = await drawn({ kind: 'dropdown', value_text: null, meta: { options: OPTIONS } });
    expect(out.text.map((t) => t.text)).toEqual(['']);
  });

  it('radio draws a ring, a filled dot and the selected label', async () => {
    const out = await drawn({ kind: 'radio', value_text: 's', meta: { options: OPTIONS } });
    expect(out.circles).toEqual([
      { x: 87, y: 624, size: 5, filled: false },
      { x: 87, y: 624, size: 2.75, filled: true },
    ]);
    expect(out.text.map((t) => t.text)).toEqual(['Small']);
    expect(out.text[0]?.x).toBe(98);
  });

  it('radio without a selection draws only the empty ring', async () => {
    const out = await drawn({ kind: 'radio', value_text: null, meta: { options: OPTIONS } });
    expect(out.circles).toEqual([{ x: 87, y: 624, size: 5, filled: false }]);
    expect(out.text).toEqual([]);
  });

  it('font_size applies to the legacy text kinds too, only when in range', async () => {
    const big = await drawn({ kind: 'text', value_text: 'x', meta: { font_size: 30 } });
    expect(big.text[0]?.size).toBe(30);
    const bad = await drawn({ kind: 'text', value_text: 'x', meta: { font_size: 3 } });
    expect(bad.text[0]?.size).toBe(12);
  });

  it('legacy kinds without meta keep the 12pt left-aligned text', async () => {
    for (const kind of ['text', 'date', 'email']) {
      const out = await drawn({ kind, value_text: 'v' });
      expect(out.text).toEqual([{ text: 'v', x: 82, y: expect.any(Number), size: 12 }]);
    }
  });
});
