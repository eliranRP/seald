/**
 * Visual burn-in verification — renders the burned PDF in a browser
 * and takes a screenshot for comparison.
 *
 * Run:  pnpm --filter api exec ts-node test/verify-burn-in-visual.ts
 *
 * 1. Burns field values into "Sig test.pdf"
 * 2. Converts the PDF to an HTML page using pdf.js-like rendering
 * 3. Opens in Playwright and takes a screenshot
 * 4. Saves to /tmp/burn-in-visual.png for inspection
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function run() {
  // Step 1: Create the burned PDF (same as burn-in-alignment.test.ts)
  const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
  const pdfBytes = readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0]!;
  page.getWidth(); // not used but validates page
  const ph = page.getHeight();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const fields = [
    { kind: 'signature', baselineFromTop: 100, value: 'eliran azuly' },
    { kind: 'initials', baselineFromTop: 222, value: 'EA' },
    { kind: 'date', baselineFromTop: 348, value: '26/05/1988' },
    { kind: 'text', baselineFromTop: 468, value: 'this is text' },
    { kind: 'checkbox', baselineFromTop: 598, value: true },
    { kind: 'email', baselineFromTop: 725, value: 'email@email.com' },
  ];

  const valueStartX = 110;

  for (const f of fields) {
    const baselineY = ph - f.baselineFromTop;
    if (f.kind === 'checkbox') {
      const size = 12;
      page.drawRectangle({
        x: valueStartX,
        y: baselineY - size,
        width: size,
        height: size,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      if (f.value === true) {
        const inset = size * 0.15,
          iw = size - inset * 2,
          ih = iw;
        const l = valueStartX + inset,
          b = baselineY - size + inset;
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

  const burnedPath = resolve(__dirname, '../../../Sig test - burned.pdf');
  const burnedBytes = await pdfDoc.save();
  writeFileSync(burnedPath, burnedBytes);
  console.log(`Burned PDF: ${burnedPath}`);

  // Step 2: Create HTML that embeds the PDF for screenshot
  const b64 = Buffer.from(burnedBytes).toString('base64');
  const html = `<!DOCTYPE html>
<html><head>
<style>body{margin:0;background:#fff;display:flex;justify-content:center;padding:20px;}
iframe{border:none;width:620px;height:880px;}</style>
</head><body>
<iframe src="data:application/pdf;base64,${b64}"></iframe>
</body></html>`;
  const htmlPath = '/tmp/burn-in-visual.html';
  writeFileSync(htmlPath, html);

  // Step 3: Screenshot with Playwright
  try {
    const pw2 = require(
      resolve(__dirname, '../../../node_modules/.pnpm/playwright@1.59.1/node_modules/playwright'),
    );
    const browser = await pw2.chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 700, height: 920 } });
    const pg = await ctx.newPage();
    await pg.goto(`file://${htmlPath}`);
    await pg.waitForTimeout(3000); // wait for PDF to render in iframe
    await pg.screenshot({ path: '/tmp/burn-in-visual.png', fullPage: true });
    console.log('Screenshot: /tmp/burn-in-visual.png');
    await browser.close();
  } catch (e) {
    console.log('Playwright not available — open the HTML manually:');
    console.log(`  open ${htmlPath}`);
  }

  // Also save a standalone HTML with the PDF embedded
  console.log(`HTML: ${htmlPath}`);
  console.log('\nCompare burned values with the "$________" lines.');
  console.log('Each value should sit ON the line baseline.');
}

run().catch(console.error);
