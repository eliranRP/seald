/**
 * Exact burn-in test using REAL field coordinates from the web editor.
 *
 * This uses the EXACT same math as sealing.service.ts to verify
 * where content lands on the PDF.
 *
 * Run: pnpm --filter api exec ts-node test/burn-in-exact.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function run() {
  const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
  const pdfDoc = await PDFDocument.load(readFileSync(pdfPath));
  const page = pdfDoc.getPages()[0]!;
  const pw = page.getWidth();
  const ph = page.getHeight();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  console.log(`PDF: ${pw} x ${ph} pt`);

  // EXACT coordinates from the web editor request payload
  const fields = [
    {
      kind: 'signature',
      x: 0.14821428571428572,
      y: 0.08378378378378379,
      width: 0.35714285714285715,
      height: 0.07297297297297298,
      value: 'eliran',
    },
    {
      kind: 'initials',
      x: 0.16964285714285715,
      y: 0.23108108108108108,
      width: 0.14285714285714285,
      height: 0.07297297297297298,
      value: 'EA',
    },
    {
      kind: 'date',
      x: 0.14821428571428572,
      y: 0.3945945945945946,
      width: 0.25,
      height: 0.04864864864864865,
      value: '2026-05-20',
    },
    {
      kind: 'text',
      x: 0.14821428571428572,
      y: 0.5445945945945946,
      width: 0.42857142857142855,
      height: 0.04864864864864865,
      value: 'this is a text',
    },
    {
      kind: 'checkbox',
      x: 0.14642857142857144,
      y: 0.7094594594594594,
      width: 0.04285714285714286,
      height: 0.032432432432432434,
      value: true,
    },
    {
      kind: 'email',
      x: 0.16964285714285715,
      y: 0.8608108108108108,
      width: 0.42857142857142855,
      height: 0.04864864864864865,
      value: 'this@email.com',
    },
  ];

  for (const f of fields) {
    const w = f.width * pw;
    const h = f.height * ph;
    const x = f.x * pw;
    // EXACT same formula as sealing.service.ts
    const y = ph - f.y * ph - h;
    const guideY = y + h * 0.3;

    // Draw the STORED field box (where the web editor thinks the field is)
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0.4, 0.7, 1),
      borderWidth: 0.5,
      color: rgb(0.9, 0.95, 1),
      opacity: 0.3,
    });

    // Draw guide line at 40% from bottom (= 60% from top)
    page.drawLine({
      start: { x: x + 5, y: guideY },
      end: { x: x + w - 5, y: guideY },
      thickness: 0.5,
      color: rgb(1, 0, 0),
    });

    // Draw a green dot at the guide line position
    page.drawCircle({ x: x, y: guideY, size: 3, color: rgb(0, 0.8, 0) });

    // ALSO draw where sealing.service.ts would render:
    if (f.kind === 'checkbox') {
      const cbY = guideY - h * 0.3;
      page.drawRectangle({
        x,
        y: cbY,
        width: w,
        height: h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
    } else {
      page.drawText(f.value as string, {
        x: x + 4,
        y: guideY,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }

    // Print the exact positions
    const topFromPageTop = ph - y - h;
    console.log(
      `${f.kind.padEnd(10)} stored_y=${(f.y * ph).toFixed(1)}pt_from_top ` +
        `box_top=${topFromPageTop.toFixed(1)} box_bottom=${(ph - y).toFixed(1)} ` +
        `guideY_from_top=${(ph - guideY).toFixed(1)} h=${h.toFixed(1)}`,
    );
  }

  const outPath = resolve(__dirname, '../../../Sig test - exact.pdf');
  writeFileSync(outPath, await pdfDoc.save());
  console.log(`\nSaved: ${outPath}`);
  console.log('Blue box = stored field position');
  console.log('Red line = guide line (h * 0.3 from bottom)');
  console.log('Green dot = where text baseline renders');
  console.log('Black text = burned-in content');
}

run().catch(console.error);
