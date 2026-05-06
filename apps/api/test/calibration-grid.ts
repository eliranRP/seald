/**
 * Field-rendering calibration test.
 *
 * Calls the REAL `burnInField()` function from burn-in-fields.ts —
 * the same function that sealing.service.ts uses in production.
 *
 * Places a red cross at 7 known positions, then calls burnInField()
 * for every field type. Green output = what sealing actually produces.
 *
 * Run: pnpm --filter api exec ts-node test/calibration-grid.ts
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  burnInField,
  defaultWidth,
  defaultHeight,
  type BurnInAssets,
  type BurnInField,
} from '../src/sealing/burn-in-fields';

// A4
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const FIELD_KINDS = ['signature', 'initials', 'date', 'text', 'checkbox', 'email'] as const;

// 7 calibration points — absolute pt from top-left (web-style origin)
const POINTS = [
  { label: 'TL', xPt: 60, yPt: 60 },
  { label: 'TR', xPt: PAGE_W - 60, yPt: 60 },
  { label: 'BL', xPt: 60, yPt: PAGE_H - 60 },
  { label: 'BR', xPt: PAGE_W - 60, yPt: PAGE_H - 60 },
  { label: 'C', xPt: PAGE_W / 2, yPt: PAGE_H / 2 },
  { label: '1/3', xPt: PAGE_W / 2, yPt: PAGE_H / 3 },
  { label: '2/3', xPt: PAGE_W / 2, yPt: (PAGE_H * 2) / 3 },
];

function drawCross(
  page: ReturnType<PDFDocument['getPages']>[0],
  cx: number,
  cy: number,
  size: number,
  color: ReturnType<typeof rgb>,
  thickness: number,
) {
  page.drawLine({ start: { x: cx - size, y: cy }, end: { x: cx + size, y: cy }, thickness, color });
  page.drawLine({ start: { x: cx, y: cy - size }, end: { x: cx, y: cy + size }, thickness, color });
}

async function run() {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // For signature/initials we need an embedded image.
  // Create a tiny 100x40 green PNG as a stand-in.
  const { createCanvas } = await import('canvas');
  const canvas = createCanvas(200, 80);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, 0, 200, 80);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('SIG IMG', 20, 50);
  const sigPng = canvas.toBuffer('image/png');
  const sigImg = await doc.embedPng(sigPng);

  const canvas2 = createCanvas(100, 60);
  const ctx2 = canvas2.getContext('2d');
  ctx2.fillStyle = '#86efac';
  ctx2.fillRect(0, 0, 100, 60);
  ctx2.fillStyle = '#000';
  ctx2.font = 'bold 24px sans-serif';
  ctx2.fillText('EA', 20, 40);
  const iniPng = canvas2.toBuffer('image/png');
  const initialsImg = await doc.embedPng(iniPng);

  const assets: BurnInAssets = { sigImg, initialsImg, helvetica, helveticaBold };

  // ── Page 1: All field types spread horizontally at y=50% ──
  {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const pw = page.getWidth();
    const ph = page.getHeight();

    page.drawText('Page 1 — Every field type at centre row  (red cross = stored x,y)', {
      x: 20,
      y: ph - 20,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    const ny = 0.5;
    const xSlots = [0.05, 0.2, 0.38, 0.55, 0.72, 0.88];

    for (let i = 0; i < FIELD_KINDS.length; i++) {
      const kind = FIELD_KINDS[i]!;
      const nx = xSlots[i]!;

      // Red cross at the stored normalised point
      const crossX = nx * pw;
      const crossY = ph - ny * ph;
      drawCross(page, crossX, crossY, 12, rgb(1, 0, 0), 1.2);
      page.drawText(kind, {
        x: crossX - 5,
        y: crossY + 16,
        size: 8,
        font: helvetica,
        color: rgb(0.6, 0, 0),
      });

      // Blue field box outline for reference
      const w = defaultWidth(kind) * pw;
      const h = defaultHeight(kind) * ph;
      const y = ph - ny * ph - h;
      page.drawRectangle({
        x: nx * pw,
        y,
        width: w,
        height: h,
        borderColor: rgb(0.4, 0.7, 1),
        borderWidth: 0.5,
        opacity: 0.3,
      });

      // ── Call the REAL burnInField function ──
      const field: BurnInField = {
        kind,
        x: nx,
        y: ny,
        width: defaultWidth(kind),
        height: defaultHeight(kind),
        value_text:
          kind === 'date' ? '2026-05-06' : kind === 'email' ? 'test@email.com' : 'sample text',
        value_boolean: kind === 'checkbox' ? true : undefined,
      };
      burnInField(page, field, assets);
    }

    page.drawText(
      'Red cross = stored (x,y)    Blue box = field box    Content = real burnInField() output',
      {
        x: 20,
        y: 15,
        size: 8,
        font: helvetica,
        color: rgb(0.3, 0.3, 0.3),
      },
    );
  }

  // ── Pages 2-7: One page per field kind, all 7 grid points ──
  for (const kind of FIELD_KINDS) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const pw = page.getWidth();
    const ph = page.getHeight();

    page.drawText(`"${kind}" — burnInField() at all 7 calibration points`, {
      x: 20,
      y: ph - 20,
      size: 10,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    for (const pt of POINTS) {
      const nx = pt.xPt / PAGE_W;
      const ny = pt.yPt / PAGE_H;

      // Red cross at exact target
      const crossX = pt.xPt;
      const crossY = ph - pt.yPt;
      drawCross(page, crossX, crossY, 12, rgb(1, 0, 0), 1.2);
      page.drawText(pt.label, {
        x: crossX + 14,
        y: crossY + 14,
        size: 8,
        font: helvetica,
        color: rgb(0.6, 0, 0),
      });

      // Blue field box
      const w = defaultWidth(kind) * pw;
      const h = defaultHeight(kind) * ph;
      const y = ph - ny * ph - h;
      page.drawRectangle({
        x: nx * pw,
        y,
        width: w,
        height: h,
        borderColor: rgb(0.4, 0.7, 1),
        borderWidth: 0.5,
        opacity: 0.3,
      });

      // ── Call the REAL burnInField function ──
      const field: BurnInField = {
        kind,
        x: nx,
        y: ny,
        width: defaultWidth(kind),
        height: defaultHeight(kind),
        value_text:
          kind === 'date' ? '2026-05-06' : kind === 'email' ? 'test@email.com' : 'sample text',
        value_boolean: kind === 'checkbox' ? true : undefined,
      };
      burnInField(page, field, assets);
    }
  }

  const outPath = resolve(__dirname, '../../../Calibration-grid.pdf');
  writeFileSync(outPath, await doc.save());
  console.log(`Saved: ${outPath} (${1 + FIELD_KINDS.length} pages)`);
  console.log('Uses the REAL burnInField() from burn-in-fields.ts');
}

run().catch(console.error);
