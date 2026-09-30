/**
 * Measure where burned-in marks land on the page pdf.js displays.
 * Run with plain `node` — pdfjs-dist's legacy build uses `import.meta`,
 * which Jest's module sandbox rejects.
 *
 * stdout is a JSON document:
 *   { pages: [{ width, height, points, images, boxes, texts }] }
 */
import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(left, right) {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function apply(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function readNumbers(value, count) {
  if (value == null || typeof value !== 'object') return null;
  const length = Array.isArray(value) ? value.length : value.length;
  if (typeof length === 'number' && length >= count) {
    const nums = [];
    for (let i = 0; i < count; i += 1) {
      const n = value[i];
      if (typeof n !== 'number') return null;
      nums.push(n);
    }
    return nums;
  }
  const nums = [];
  for (let i = 0; i < count; i += 1) {
    const n = value[String(i)];
    if (typeof n !== 'number') return null;
    nums.push(n);
  }
  return nums;
}

function readMatrix(value) {
  const nums = readNumbers(value, 6);
  if (!nums) return null;
  return nums;
}

function viewportRect(viewport, corners) {
  const points = corners.map((corner) => viewport.convertToViewportPoint(corner.x, corner.y));
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

async function measurePage(page) {
  const viewport = page.getViewport({ scale: 1 });
  const list = await page.getOperatorList();
  const images = [];
  const boxes = [];
  const texts = [];
  const stack = [];
  let ctm = IDENTITY;

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const next = readMatrix(Array.isArray(args) ? args : null);
      if (next) ctm = multiply(ctm, next);
    } else if (fn === OPS.paintImageXObject) {
      const width = Array.isArray(args) && typeof args[1] === 'number' ? args[1] : 1;
      const height = Array.isArray(args) && typeof args[2] === 'number' ? args[2] : 1;
      images.push(
        viewportRect(viewport, [
          apply(ctm, 0, 0),
          apply(ctm, width, 0),
          apply(ctm, 0, height),
          apply(ctm, width, height),
        ]),
      );
    } else if (fn === OPS.constructPath) {
      const bounds = Array.isArray(args) ? readNumbers(args[2], 4) : null;
      if (!bounds) continue;
      const [minX, minY, maxX, maxY] = bounds;
      if (maxX - minX < 8 || maxY - minY < 8) continue;
      boxes.push(
        viewportRect(viewport, [
          apply(ctm, minX, minY),
          apply(ctm, maxX, minY),
          apply(ctm, minX, maxY),
          apply(ctm, maxX, maxY),
        ]),
      );
    } else if (fn === OPS.setTextMatrix) {
      const matrix = readMatrix(Array.isArray(args) ? args[0] : args);
      if (!matrix) continue;
      const origin = apply(ctm, matrix[4], matrix[5]);
      const tip = apply(ctm, matrix[4] + matrix[0] * 40, matrix[5] + matrix[1] * 40);
      const originVp = viewport.convertToViewportPoint(origin.x, origin.y);
      const tipVp = viewport.convertToViewportPoint(tip.x, tip.y);
      texts.push({ x: originVp[0], y: originVp[1], aheadX: tipVp[0], aheadY: tipVp[1] });
    }
  }

  const samples = [
    [0, 0],
    [viewport.width, 0],
    [0, viewport.height],
    [viewport.width * 0.37, viewport.height * 0.62],
  ];
  const points = samples.map(([x, y]) => {
    const pdf = viewport.convertToPdfPoint(x, y);
    return { x, y, pdfX: pdf[0], pdfY: pdf[1] };
  });

  return { width: viewport.width, height: viewport.height, points, images, boxes, texts };
}

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error('usage: node measure-placement.mjs <pdf>');
  process.exit(1);
}

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
const pages = [];
for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
  pages.push(await measurePage(await doc.getPage(pageNumber)));
}
process.stdout.write(JSON.stringify({ pages }));
