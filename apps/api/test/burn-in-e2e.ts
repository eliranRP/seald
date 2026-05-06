/**
 * Two-pass burn-in calibration:
 *   Pass 1: "Sig test - placed.pdf" — shows field boxes where the editor stores them
 *   Pass 2: "Sig test - e2e.pdf" — shows burned-in content
 *
 * Run: pnpm --filter api exec ts-node test/burn-in-e2e.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface Field {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  value: string | boolean;
}

// Calibrate one field at a time — uncomment fields as you go
const ALL_FIELDS: Field[] = [
  { kind: 'signature', x: 0.14821, y: 0.08378, w: 0.35714, h: 0.07297, value: 'Eliran Azulay' },
  { kind: 'initials', x: 0.16964, y: 0.23108, w: 0.14286, h: 0.07297, value: 'EA' },
  { kind: 'date', x: 0.14821, y: 0.39459, w: 0.25, h: 0.04865, value: '2026-05-06' },
  { kind: 'text', x: 0.14821, y: 0.54459, w: 0.42857, h: 0.04865, value: 'this is a text' },
  { kind: 'checkbox', x: 0.14643, y: 0.70946, w: 0.04286, h: 0.03243, value: true },
  { kind: 'email', x: 0.16964, y: 0.86081, w: 0.42857, h: 0.04865, value: 'eliran@email.com' },
];

async function run() {
  const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
  const srcBytes = readFileSync(pdfPath);

  // ========== PASS 1: Show field placement ==========
  const doc1 = await PDFDocument.load(srcBytes);
  const page1 = doc1.getPages()[0]!;
  const pw = page1.getWidth();
  const ph = page1.getHeight();
  const font1 = await doc1.embedFont(StandardFonts.Helvetica);

  for (const f of ALL_FIELDS) {
    const w = f.w * pw;
    const h = f.h * ph;
    const x = f.x * pw;
    const y = ph - f.y * ph - h;

    // Pink field box (like the editor)
    page1.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0.83, 0.5, 0.48),
      borderWidth: 1.5,
      color: rgb(0.95, 0.85, 0.83),
      opacity: 0.5,
    });

    // Label
    page1.drawText(f.kind.charAt(0).toUpperCase() + f.kind.slice(1), {
      x: x + 16,
      y: y + h - 13,
      size: 11,
      font: font1,
      color: rgb(0.4, 0.2, 0.2),
    });

    // Guide line (where user aligns with document line)
    page1.drawLine({
      start: { x: x + 8, y: y + h * 0.4 },
      end: { x: x + w - 8, y: y + h * 0.4 },
      thickness: 0.8,
      color: rgb(0.5, 0.2, 0.2),
    });
  }

  const placedPath = resolve(__dirname, '../../../Sig test - placed.pdf');
  writeFileSync(placedPath, await doc1.save());
  console.log(`Pass 1 (field boxes): ${placedPath}`);

  // ========== PASS 2: Burn in content ==========
  const doc2 = await PDFDocument.load(srcBytes);
  const page2 = doc2.getPages()[0]!;
  const font2 = await doc2.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc2.embedFont(StandardFonts.HelveticaBold);

  for (const f of ALL_FIELDS) {
    const w = f.w * pw;
    const h = f.h * ph;
    const x = f.x * pw;
    const y = ph - f.y * ph - h;

    // === SAME LOGIC AS sealing.service.ts ===
    if (f.kind === 'signature') {
      const sigX = x;
      const sigY = y + h * 0.15;
      page2.drawText(f.value as string, {
        x: sigX + 10,
        y: sigY + h * 0.3,
        size: 18,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page2.drawRectangle({
        x: sigX,
        y: sigY,
        width: w,
        height: h,
        borderColor: rgb(0.7, 0.9, 0.7),
        borderWidth: 0.3,
        opacity: 0.15,
      });
    } else if (f.kind === 'initials') {
      const iniY = y + h * 0.15;
      page2.drawText(f.value as string, {
        x: x + 10,
        y: iniY + h * 0.3,
        size: 20,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      page2.drawRectangle({
        x,
        y: iniY,
        width: w,
        height: h,
        borderColor: rgb(0.7, 0.9, 0.7),
        borderWidth: 0.3,
        opacity: 0.15,
      });
    } else if (f.kind === 'checkbox') {
      const cbY = y + h * 0.35;
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
      const textNudge = f.kind === 'date' ? 0.55 : f.kind === 'email' ? 0.85 : 0.7;
      page2.drawText(f.value as string, {
        x: x + 4,
        y: y + h * textNudge,
        size: 12,
        font: font2,
        color: rgb(0, 0, 0),
      });
    }
  }

  const burnedPath = resolve(__dirname, '../../../Sig test - e2e.pdf');
  writeFileSync(burnedPath, await doc2.save());
  console.log(`Pass 2 (burned in):   ${burnedPath}`);
}

run().catch(console.error);
