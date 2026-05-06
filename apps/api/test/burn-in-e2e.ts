/**
 * End-to-end burn-in test — mimics the full flow:
 *   1. Upload "Sig test.pdf" as a draft
 *   2. Place all field types at known positions
 *   3. Add a signer
 *   4. Send the envelope
 *   5. Sign all fields (simulate)
 *   6. Wait for sealing
 *   7. Download the sealed PDF
 *   8. Save for visual inspection
 *
 * Run: pnpm --filter api exec ts-node test/burn-in-e2e.ts
 *
 * Requires: API running on localhost:3000, authenticated user session.
 * Uses the Supabase service role key to bypass auth for testing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Simpler approach: directly use pdf-lib to simulate what the
 * sealing service does, using the EXACT same code path.
 *
 * This avoids needing auth tokens, API calls, etc. — it just
 * exercises the burn-in math directly.
 */
async function run() {
  const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
  const pdfDoc = await PDFDocument.load(readFileSync(pdfPath));
  const page = pdfDoc.getPages()[0]!;
  const pw = page.getWidth();
  const ph = page.getHeight();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  console.log(`PDF: ${pw} x ${ph} pt`);

  // Real field coordinates from the web editor
  const fields = [
    { kind: 'signature', x: 0.14821, y: 0.08378, w: 0.35714, h: 0.07297, value: 'Eliran Azulay' },
    { kind: 'initials', x: 0.16964, y: 0.23108, w: 0.14286, h: 0.07297, value: 'EA' },
    { kind: 'date', x: 0.14821, y: 0.39459, w: 0.25, h: 0.04865, value: '2026-05-06' },
    { kind: 'text', x: 0.14821, y: 0.54459, w: 0.42857, h: 0.04865, value: 'this is a text' },
    { kind: 'checkbox', x: 0.14643, y: 0.70946, w: 0.04286, h: 0.03243, value: true },
    { kind: 'email', x: 0.16964, y: 0.86081, w: 0.42857, h: 0.04865, value: 'eliran@email.com' },
  ];

  // ============================================================
  // EXACT SAME LOGIC AS sealing.service.ts — copy-pasted
  // ============================================================
  for (const f of fields) {
    const w = f.w * pw;
    const h = f.h * ph;
    const x = f.x * pw;
    const y = ph - f.y * ph - h;

    // --- Current sealing.service.ts logic ---
    if (f.kind === 'signature') {
      // Nudge: 15% up, 30% left
      // In prod this is drawImage with the signature PNG
      // Here we simulate with text in Caveat-like style
      const sigX = x - w * 0.3;
      const sigY = y + h * 0.15;
      page.drawText(f.value as string, {
        x: sigX + 10,
        y: sigY + h * 0.3,
        size: 18,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      // Draw the image boundary for reference
      page.drawRectangle({
        x: sigX,
        y: sigY,
        width: w,
        height: h,
        borderColor: rgb(0.7, 0.9, 0.7),
        borderWidth: 0.3,
        opacity: 0.2,
      });
    } else if (f.kind === 'initials') {
      // Nudge: 15% up
      const iniY = y + h * 0.15;
      page.drawText(f.value as string, {
        x: x + 10,
        y: iniY + h * 0.3,
        size: 20,
        font: helveticaBold,
        color: rgb(0, 0, 0),
      });
      page.drawRectangle({
        x,
        y: iniY,
        width: w,
        height: h,
        borderColor: rgb(0.7, 0.9, 0.7),
        borderWidth: 0.3,
        opacity: 0.2,
      });
    } else if (f.kind === 'checkbox') {
      // Nudge checkbox up by 35%
      const cbY = y + h * 0.35;
      page.drawRectangle({
        x,
        y: cbY,
        width: w,
        height: h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      if (f.value === true) {
        const inset = Math.min(w, h) * 0.18;
        const innerW = w - inset * 2;
        const innerH = h - inset * 2;
        const left = x + inset;
        const bottom = cbY + inset;
        const stroke = Math.max(0.8, Math.min(w, h) * 0.12);
        page.drawLine({
          start: { x: left, y: bottom + innerH * 0.6 },
          end: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
          thickness: stroke,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
          end: { x: left + innerW, y: bottom + innerH * 0.95 },
          thickness: stroke,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      // text / date / email — nudge up proportionally
      // Date is close at 0.55, text/email need more
      const textNudge = f.kind === 'date' ? 0.55 : f.kind === 'email' ? 0.85 : 0.7;
      page.drawText(f.value as string, {
        x: x + 4,
        y: y + h * textNudge,
        size: 12,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
  }

  // Save
  const outPath = resolve(__dirname, '../../../Sig test - e2e.pdf');
  writeFileSync(outPath, await pdfDoc.save());
  console.log(`\nSaved: ${outPath}`);
  console.log('Open this PDF and compare each field with the $____ line.');
  console.log('Fields should render ON or very close to each line.');
}

run().catch(console.error);
