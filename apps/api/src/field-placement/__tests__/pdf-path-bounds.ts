import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { FieldPlacementError } from '../field-placement.errors';

const nodeRequire = createRequire(__filename);
const PDFJS_HREF = pathToFileURL(nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;

export interface PdfPathBound {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Test-only path bounds. The production worker does not expose this op.
 * Bounds come from constructPath min/max and ignore the CTM, so they
 * match identity-CTM stamps only.
 */
const WORKER_SOURCE = `
const { parentPort } = require('worker_threads');
let pdfjsPromise = null;
function pdfjs(href) {
  if (!pdfjsPromise) pdfjsPromise = import(href);
  return pdfjsPromise;
}
function numbers(value, count) {
  if (!value || typeof value.length !== 'number' || value.length < count) return null;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const item = value[i];
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}
function pathBounds(args) {
  if (!args || typeof args.length !== 'number' || args.length < 3) return null;
  const raw = numbers(args[2], 4);
  if (!raw) return null;
  return {
    x: Math.min(raw[0], raw[2]),
    y: Math.min(raw[1], raw[3]),
    width: Math.abs(raw[2] - raw[0]),
    height: Math.abs(raw[3] - raw[1]),
  };
}
parentPort.on('message', (msg) => {
  (async () => {
    const lib = await pdfjs(msg.pdfjsHref);
    const loadingTask = lib.getDocument({
      data: new Uint8Array(msg.bytes),
      verbosity: 0,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    try {
      const bounds = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const list = await page.getOperatorList();
        const fns = list && list.fnArray;
        const args = list && list.argsArray;
        if (!fns || !args) continue;
        for (let i = 0; i < fns.length; i += 1) {
          if (fns[i] !== lib.OPS.constructPath) continue;
          const rect = pathBounds(args[i]);
          if (rect) bounds.push(rect);
        }
      }
      return { bounds };
    } finally {
      if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
    }
  })().then(
    (result) => parentPort.postMessage({ id: msg.id, ok: true, result }),
    (err) => parentPort.postMessage({
      id: msg.id,
      ok: false,
      message: err && err.message ? String(err.message) : 'path worker failed',
    }),
  );
});
`;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>();

function failAll(err: Error): void {
  for (const job of pending.values()) job.reject(err);
  pending.clear();
}

export async function stopPathWorker(): Promise<void> {
  const child = worker;
  worker = null;
  failAll(new FieldPlacementError('invalid_pdf', 'path worker stopped'));
  if (child) await child.terminate();
}

function ensure(): Worker {
  if (worker) return worker;
  const child = new Worker(WORKER_SOURCE, { eval: true });
  child.unref();
  child.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const record = message as { id?: unknown; ok?: unknown; result?: unknown; message?: unknown };
    if (typeof record.id !== 'number') return;
    const job = pending.get(record.id);
    if (!job) return;
    pending.delete(record.id);
    if (record.ok === true) job.resolve(record.result);
    else
      job.reject(
        new FieldPlacementError('invalid_pdf', String(record.message ?? 'path worker failed')),
      );
  });
  child.on('error', (err) => {
    if (worker === child) worker = null;
    failAll(err);
  });
  worker = child;
  return child;
}

export async function listPathBounds(bytes: Uint8Array): Promise<PdfPathBound[]> {
  const child = ensure();
  const id = nextId;
  nextId += 1;
  const value = await new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.postMessage({ id, pdfjsHref: PDFJS_HREF, bytes });
  });
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { bounds?: unknown }).bounds)
  ) {
    throw new FieldPlacementError('invalid_pdf', 'pdf.js did not return path bounds');
  }
  const bounds: PdfPathBound[] = [];
  for (const bound of (value as { bounds: unknown[] }).bounds) {
    if (typeof bound !== 'object' || bound === null) continue;
    const box = bound as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
    if (
      typeof box.x !== 'number' ||
      typeof box.y !== 'number' ||
      typeof box.width !== 'number' ||
      typeof box.height !== 'number'
    ) {
      continue;
    }
    bounds.push({ x: box.x, y: box.y, width: box.width, height: box.height });
  }
  return bounds;
}
