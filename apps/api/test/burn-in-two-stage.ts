/**
 * Two-stage burn-in test:
 *   Stage 1: "Sig test - fields placed.pdf" — shows field boxes where
 *            the user would place them (bottom edge on the line)
 *   Stage 2: "Sig test - burned.pdf" — burns in values using the
 *            EXACT same logic as sealing.service.ts
 *
 * Run:  pnpm --filter api exec ts-node test/burn-in-two-stage.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Field definitions — simulates what the web editor stores
// y = normalized distance from page TOP to the TOP of the field tile
// The user positions the tile so its internal guide line (at 60% height)
// sits on the document's $________ line.
interface TestField {
  kind: string;
  lineFromTop: number; // where the $____ line is (pt from top)
  width: number; // field width in pt
  height: number; // field height in pt
  value: string | boolean;
}

const FIELDS: TestField[] = [
  { kind: 'signature', lineFromTop: 100, width: 200, height: 54, value: 'eliran azuly' },
  { kind: 'initials', lineFromTop: 222, width: 80, height: 40, value: 'EA' },
  { kind: 'date', lineFromTop: 348, width: 160, height: 30, value: '26/05/1988' },
  { kind: 'text', lineFromTop: 468, width: 200, height: 30, value: 'this is text' },
  { kind: 'checkbox', lineFromTop: 598, width: 24, height: 24, value: true },
  { kind: 'email', lineFromTop: 725, width: 200, height: 30, value: 'email@email.com' },
];

const FIELD_X = 140; // X position where field starts (after "$")
const _CANVAS_W = 560; // documented for reference
void _CANVAS_W;

async function run() {
  const srcPath = resolve(__dirname, '../../../Sig test.pdf');
  const srcBytes = readFileSync(srcPath);

  // ============ STAGE 1: Place field boxes ============
  const doc1 = await PDFDocument.load(srcBytes);
  const page1 = doc1.getPages()[0]!;
  page1.getWidth();
  const ph = page1.getHeight();

  const renderedPdfH1 = ph * (_CANVAS_W / page1.getWidth());

  for (const f of FIELDS) {
    // Simulate: user places field so the line guide aligns with doc line.
    // In canvas coords: canvasY = lineFromTop (as if 1:1 with PDF).
    // After normalization: normY = canvasY / CANVAS_H
    // After Y correction: correctedY = normY * (CANVAS_H / renderedPdfH)
    // This maps the canvas position to the correct PDF position.
    void renderedPdfH1; // used only for documentation
    const fieldTopFromTop = f.lineFromTop - f.height * 0.5; // center field on the line
    const y = ph - fieldTopFromTop - f.height;

    // Draw the field box (pink/salmon like the editor)
    page1.drawRectangle({
      x: FIELD_X,
      y,
      width: f.width,
      height: f.height,
      borderColor: rgb(0.83, 0.5, 0.48), // salmon border
      borderWidth: 1,
      color: rgb(0.95, 0.85, 0.83), // light pink fill
      opacity: 0.5,
    });

    // Draw field label inside the box
    const helvetica = await doc1.embedFont(StandardFonts.Helvetica);
    const label = f.kind.charAt(0).toUpperCase() + f.kind.slice(1);
    page1.drawText(label, {
      x: FIELD_X + 18,
      y: y + f.height - 14,
      size: 11,
      font: helvetica,
      color: rgb(0.4, 0.2, 0.2),
    });

    // Draw the guide line inside the box (at 60% from top = 40% from bottom)
    const guideY = y + f.height * (1 - 0.6);
    page1.drawLine({
      start: { x: FIELD_X + 10, y: guideY },
      end: { x: FIELD_X + f.width - 10, y: guideY },
      thickness: 0.5,
      color: rgb(0.6, 0.3, 0.3),
    });
  }

  const placed = await doc1.save();
  const placedPath = resolve(__dirname, '../../../Sig test - fields placed.pdf');
  writeFileSync(placedPath, placed);
  console.log(`Stage 1 (fields placed): ${placedPath}`);

  // ============ STAGE 2: Burn in values ============
  // Uses the EXACT same logic as sealing.service.ts
  const doc2 = await PDFDocument.load(srcBytes);
  const page2 = doc2.getPages()[0]!;
  const helvetica2 = await doc2.embedFont(StandardFonts.Helvetica);

  for (const f of FIELDS) {
    const fieldTopFromTop = f.lineFromTop - f.height * 0.6;
    const w = f.width;
    const h = f.height;
    const x = FIELD_X;
    const y = ph - fieldTopFromTop - h;

    // === SAME LOGIC AS sealing.service.ts ===
    const guideY = y + h * 0.4;

    if (f.kind === 'signature' || f.kind === 'initials') {
      // In production: drawImage fills the box. Here simulate with text.
      const fontSize = f.kind === 'initials' ? 20 : 14;
      page2.drawText(f.value as string, {
        x: x + 4,
        y: guideY,
        size: fontSize,
        font: helvetica2,
        color: rgb(0, 0, 0),
      });
    } else if (f.kind === 'checkbox') {
      const cbY = guideY - h / 2;
      page2.drawRectangle({
        x,
        y: cbY,
        width: w,
        height: h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      if (f.value === true) {
        const inset = Math.min(w, h) * 0.18;
        const iw = w - inset * 2,
          ih = h - inset * 2;
        const l = x + inset,
          b = cbY + inset;
        const s = Math.max(0.8, Math.min(w, h) * 0.12);
        page2.drawLine({
          start: { x: l, y: b + ih * 0.6 },
          end: { x: l + iw * 0.4, y: b + ih * 0.15 },
          thickness: s,
          color: rgb(0, 0, 0),
        });
        page2.drawLine({
          start: { x: l + iw * 0.4, y: b + ih * 0.15 },
          end: { x: l + iw, y: b + ih * 0.95 },
          thickness: s,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      page2.drawText(f.value as string, {
        x: x + 4,
        y: guideY,
        size: Math.min(h * 0.4, 12),
        font: helvetica2,
        color: rgb(0, 0, 0),
      });
    }
  }

  const burned = await doc2.save();
  const burnedPath = resolve(__dirname, '../../../Sig test - burned.pdf');
  writeFileSync(burnedPath, burned);
  console.log(`Stage 2 (burned in):    ${burnedPath}`);
  console.log(
    '\nCompare: the burned values should sit exactly on the guide line inside each field box.',
  );
}

run().catch(console.error);
