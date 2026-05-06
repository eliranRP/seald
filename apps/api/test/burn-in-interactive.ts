/**
 * Interactive burn-in test — opens an HTML page where you can
 * adjust Y offset with a slider and see the result instantly.
 *
 * Run:  pnpm --filter api exec ts-node test/burn-in-interactive.ts
 * Then open: /tmp/burn-in-interactive.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the actual field coordinates from the user's test
const fields = [
  { kind: 'signature', x: 0.14821, y: 0.08378, w: 0.35714, h: 0.07297, value: 'eliran azuly' },
  { kind: 'initials', x: 0.16964, y: 0.23108, w: 0.14286, h: 0.07297, value: 'EA' },
  { kind: 'date', x: 0.14821, y: 0.39459, w: 0.25, h: 0.04865, value: '2026-05-06' },
  { kind: 'text', x: 0.14821, y: 0.54459, w: 0.42857, h: 0.04865, value: 'this is a text' },
  { kind: 'checkbox', x: 0.14643, y: 0.70946, w: 0.04286, h: 0.03243, value: '✓' },
  { kind: 'email', x: 0.16964, y: 0.86081, w: 0.42857, h: 0.04865, value: 'email@email.com' },
];

// Read the PDF and encode as base64
const pdfPath = resolve(__dirname, '../../../Sig test.pdf');
const pdfB64 = readFileSync(pdfPath).toString('base64');

const html =
  `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Burn-in Interactive Adjuster</title>
<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"><` +
  `/script>
<style>
  body { font-family: Inter, sans-serif; margin: 0; display: flex; height: 100vh; }
  .sidebar { width: 380px; padding: 20px; overflow-y: auto; border-right: 1px solid #ddd; background: #f8f8f8; }
  .main { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 20px; overflow: auto; background: #e0e0e0; }
  canvas { box-shadow: 0 2px 12px rgba(0,0,0,.15); }
  h2 { margin: 0 0 16px; font-size: 18px; }
  .field-group { margin-bottom: 16px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #ddd; }
  .field-group h3 { margin: 0 0 8px; font-size: 14px; color: #333; }
  .slider-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .slider-row label { font-size: 12px; width: 60px; color: #666; }
  .slider-row input[type=range] { flex: 1; }
  .slider-row .val { font-size: 12px; width: 50px; text-align: right; font-family: monospace; }
  button { padding: 10px 20px; background: #4F46E5; color: #fff; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; width: 100%; margin-top: 12px; }
  button:hover { background: #4338CA; }
  .info { font-size: 11px; color: #888; margin-top: 8px; }
</style>
</head>
<body>
<div class="sidebar">
  <h2>Burn-in Position Adjuster</h2>
  <p style="font-size:13px;color:#555;">Adjust the Y offset (in pt) for each field type until the text sits ON the line. Positive = move up, negative = move down.</p>
  <div id="controls"></div>
  <button onclick="render()">Re-render PDF</button>
  <div class="info" id="status">Ready</div>
  <div class="info" style="margin-top:16px;">
    <strong>How to use:</strong><br>
    1. Click "Re-render PDF"<br>
    2. Adjust sliders until text aligns with each line<br>
    3. Note the offset values<br>
    4. Share the values with me
  </div>
</div>
<div class="main">
  <canvas id="pdfCanvas" width="596" height="842"></canvas>
</div>
<script>
const PDFLib = window.PDFLib;
const pdfB64 = "${pdfB64}";

const fields = ${JSON.stringify(fields)};

// Create controls
const controlsDiv = document.getElementById('controls');
const offsets = {};

fields.forEach(f => {
  offsets[f.kind] = { yOff: 0, xOff: 0 };
  const div = document.createElement('div');
  div.className = 'field-group';
  div.innerHTML = \`
    <h3>\${f.kind} (\${f.value})</h3>
    <div class="slider-row">
      <label>Y offset</label>
      <input type="range" min="-30" max="30" value="0" step="1" id="y_\${f.kind}" oninput="updateVal(this)">
      <span class="val" id="yv_\${f.kind}">0pt</span>
    </div>
    <div class="slider-row">
      <label>X offset</label>
      <input type="range" min="-30" max="30" value="0" step="1" id="x_\${f.kind}" oninput="updateVal(this)">
      <span class="val" id="xv_\${f.kind}">0pt</span>
    </div>
    <div class="slider-row">
      <label>Font size</label>
      <input type="range" min="6" max="24" value="12" step="1" id="fs_\${f.kind}" oninput="updateVal(this)">
      <span class="val" id="fsv_\${f.kind}">12pt</span>
    </div>
  \`;
  controlsDiv.appendChild(div);
});

function updateVal(el) {
  const id = el.id;
  const kind = id.split('_')[1];
  const prefix = id.split('_')[0];
  document.getElementById(prefix + 'v_' + kind).textContent = el.value + 'pt';
}

async function render() {
  document.getElementById('status').textContent = 'Rendering...';

  const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
  const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0];
  const pw = page.getWidth();
  const ph = page.getHeight();
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const { rgb } = PDFLib;

  for (const f of fields) {
    const w = f.w * pw;
    const h = f.h * ph;
    const x = f.x * pw;
    const y = ph - f.y * ph - h;

    const yOff = parseInt(document.getElementById('y_' + f.kind).value) || 0;
    const xOff = parseInt(document.getElementById('x_' + f.kind).value) || 0;
    const fontSize = parseInt(document.getElementById('fs_' + f.kind).value) || 12;

    // Draw field box (light blue)
    page.drawRectangle({
      x, y, width: w, height: h,
      borderColor: rgb(0.4, 0.7, 1), borderWidth: 0.5,
      color: rgb(0.92, 0.96, 1), opacity: 0.4,
    });

    if (f.kind === 'checkbox') {
      const cbSize = Math.min(w, h);
      page.drawRectangle({
        x: x + xOff, y: y + yOff, width: cbSize, height: cbSize,
        borderColor: rgb(0, 0, 0), borderWidth: 0.5,
      });
      // Checkmark
      const inset = cbSize * 0.18;
      const iw = cbSize - inset*2, ih = iw;
      const l = x + xOff + inset, b = y + yOff + inset;
      page.drawLine({ start:{x:l, y:b+ih*0.6}, end:{x:l+iw*0.4, y:b+ih*0.15}, thickness:1, color:rgb(0,0,0) });
      page.drawLine({ start:{x:l+iw*0.4, y:b+ih*0.15}, end:{x:l+iw, y:b+ih*0.95}, thickness:1, color:rgb(0,0,0) });
    } else {
      page.drawText(f.value, {
        x: x + 4 + xOff,
        y: y + yOff,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
  }

  // Render to canvas
  const outBytes = await pdfDoc.save();
  const blob = new Blob([outBytes], { type: 'application/pdf' });

  // Use pdf.js to render
  if (!window.pdfjsLib) {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; renderToCanvas(outBytes); };
    document.head.appendChild(s);
  } else {
    renderToCanvas(outBytes);
  }
}

async function renderToCanvas(pdfBytes) {
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await pdf.getPage(1);
  const scale = 1.5;
  const viewport = page.getViewport({ scale });
  const canvas = document.getElementById('pdfCanvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  document.getElementById('status').textContent = 'Done. Adjust sliders and click Re-render.';
}

// Initial render
render();
<` +
  `/script>
</body>
</html>`;

const outPath = '/tmp/burn-in-interactive.html';
writeFileSync(outPath, html);
console.log(`Open in browser: open ${outPath}`);
console.log('Adjust sliders until each field aligns with its line, then share the offset values.');
