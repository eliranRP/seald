/**
 * Visual burn-in alignment test.
 * Run:  pnpm --filter api exec ts-node test/burn-in-alignment.test.ts
 *
 * Expected result: burned-in values sit ON the $________ line, like
 * handwriting on a ruled line. The text baseline aligns with the
 * document line baseline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function burnInTest() {
  const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
  const pdfBytes = readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const page = pages[0]!;
  const pw = page.getWidth();
  const ph = page.getHeight();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  console.log(`Page: ${pw} x ${ph} pt`);

  // The "$________" lines — measured Y of the baseline from TOP of page.
  // The text "Sig $____" has its baseline at this Y position.
  // Our burned-in text should have its baseline at the SAME Y.
  //
  // Measured from the PDF (approximate):
  //   Sig $       baseline ~100pt from top
  //   Initials $  baseline ~230pt from top
  //   Date $      baseline ~370pt from top
  //   Text $      baseline ~490pt from top
  //   Other $     baseline ~630pt from top (checkbox)
  //   Other $     baseline ~748pt from top (email)

  const fields = [
    { kind: 'signature', baselineFromTop: 100, value: 'eliran azuly' },
    { kind: 'initials', baselineFromTop: 222, value: 'EA' },
    { kind: 'date', baselineFromTop: 348, value: '26/05/1988' },
    { kind: 'text', baselineFromTop: 468, value: 'this is text' },
    { kind: 'checkbox', baselineFromTop: 598, value: true },
    { kind: 'email', baselineFromTop: 725, value: 'email@email.com' },
  ];

  // The X position where the "$" ends and values start (~110pt from left)
  const valueStartX = 110;

  for (const f of fields) {
    // Convert from top-origin to PDF bottom-origin
    const baselineY = ph - f.baselineFromTop;

    if (f.kind === 'checkbox') {
      // Draw a small checkbox on the line
      const size = 12;
      page.drawRectangle({
        x: valueStartX,
        y: baselineY - size, // box bottom at baseline - size
        width: size,
        height: size,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      // Checkmark
      if (f.value === true) {
        const inset = size * 0.15;
        const iw = size - inset * 2;
        const ih = size - inset * 2;
        const l = valueStartX + inset;
        const b = baselineY - size + inset;
        page.drawLine({
          start: { x: l, y: b + ih * 0.6 },
          end: { x: l + iw * 0.4, y: b + ih * 0.15 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: l + iw * 0.4, y: b + ih * 0.15 },
          end: { x: l + iw, y: b + ih * 0.95 },
          thickness: 1,
          color: rgb(0, 0, 0),
        });
      }
    } else {
      // Draw text with its baseline ON the document line
      const fontSize = f.kind === 'signature' ? 14 : f.kind === 'initials' ? 14 : 12;
      page.drawText(f.value as string, {
        x: valueStartX,
        y: baselineY,
        size: fontSize,
        font: helvetica,
        color: rgb(0, 0, 0),
      });
    }
  }

  const outPath = resolve(__dirname, '../../../Sig test - burned.pdf');
  writeFileSync(outPath, await pdfDoc.save());
  console.log(`Saved: ${outPath}`);
  console.log('Values should sit ON each $____ line, like handwriting.');
}

burnInTest().catch(console.error);
