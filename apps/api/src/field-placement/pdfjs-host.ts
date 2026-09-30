import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { FieldPlacementError } from './field-placement.errors';

const nodeRequire = createRequire(__filename);

export interface PdfjsPageSnapshot {
  readonly page: number;
  readonly width: number;
  readonly height: number;
  readonly rotate: number;
  readonly transform: readonly number[];
}

export interface PdfjsTextSnapshot {
  readonly page: number;
  readonly str: string;
  readonly transform: readonly number[];
  readonly width: number;
  readonly height: number;
}

export interface PdfjsWidgetSnapshot {
  readonly page: number;
  readonly fieldName: string;
  readonly fieldType: string;
  readonly rect: readonly number[];
  readonly checkBox: boolean;
  readonly radioButton: boolean;
  readonly pushButton: boolean;
  readonly combo: boolean;
}

export interface PdfjsInspection {
  readonly pages: readonly PdfjsPageSnapshot[];
  readonly textItems: readonly PdfjsTextSnapshot[];
  readonly widgets: readonly PdfjsWidgetSnapshot[];
}

export interface PdfPathBound {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let queue: Promise<void> = Promise.resolve();

const PDFJS_HREF = pathToFileURL(nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;

/**
 * pdf.js is ESM and uses `import.meta`. Jest evaluates tests inside a
 * VM, and turning on Node's VM-module flag breaks other suites (jose).
 * This worker is a real Node thread, so `import()` works there.
 * The thread holds no PDF cache: each call opens the bytes it is given.
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
  const box = args[2];
  const raw = numbers(box, 4);
  if (!raw) return null;
  const x0 = raw[0];
  const y0 = raw[1];
  const x1 = raw[2];
  const y1 = raw[3];
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

async function open(msg) {
  const lib = await pdfjs(msg.pdfjsHref);
  const pdf = await lib.getDocument({
    data: new Uint8Array(msg.bytes),
    verbosity: 0,
    isEvalSupported: false,
  }).promise;
  return { lib, pdf };
}

async function handle(msg) {
  if (msg.op === 'inspect') {
    const { pdf } = await open(msg);
    const pages = [];
    const textItems = [];
    const widgets = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const transform = numbers(viewport.transform, 6);
      if (!transform) throw new Error('page ' + pageNumber + ' has no viewport');
      pages.push({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
        rotate: page.rotate,
        transform,
      });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item || typeof item.str !== 'string' || item.str.length === 0) continue;
        const matrix = numbers(item.transform, 6);
        if (!matrix || typeof item.width !== 'number' || typeof item.height !== 'number') continue;
        textItems.push({
          page: pageNumber,
          str: item.str,
          transform: matrix,
          width: item.width,
          height: item.height,
        });
      }
      const annotations = await page.getAnnotations();
      for (const annotation of annotations) {
        if (!annotation || annotation.subtype !== 'Widget') continue;
        if (typeof annotation.fieldName !== 'string') continue;
        const rect = numbers(annotation.rect, 4);
        if (!rect) continue;
        widgets.push({
          page: pageNumber,
          fieldName: annotation.fieldName,
          fieldType: typeof annotation.fieldType === 'string' ? annotation.fieldType : 'unknown',
          rect,
          checkBox: annotation.checkBox === true,
          radioButton: annotation.radioButton === true,
          pushButton: annotation.pushButton === true,
          combo: annotation.combo === true,
        });
      }
    }
    if (typeof pdf.cleanup === 'function') pdf.cleanup();
    return { pages, textItems, widgets };
  }

  if (msg.op === 'paths') {
    const { lib, pdf } = await open(msg);
    const bounds = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      if (typeof page.getOperatorList !== 'function') continue;
      const list = await page.getOperatorList();
      const fns = list && list.fnArray;
      const args = list && list.argsArray;
      if (!fns || !args || typeof fns.length !== 'number') continue;
      for (let i = 0; i < fns.length; i += 1) {
        if (fns[i] !== lib.OPS.constructPath) continue;
        const rect = pathBounds(args[i]);
        if (rect) bounds.push(rect);
      }
    }
    if (typeof pdf.cleanup === 'function') pdf.cleanup();
    return { bounds };
  }

  throw new Error('unknown pdf worker op');
}

parentPort.on('message', (msg) => {
  handle(msg).then(
    (result) => parentPort.postMessage({ id: msg.id, ok: true, result }),
    (err) => parentPort.postMessage({
      id: msg.id,
      ok: false,
      message: err && err.message ? String(err.message) : 'pdf worker failed',
    }),
  );
});
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function failAll(err: Error): void {
  for (const job of pending.values()) job.reject(err);
  pending.clear();
}

export async function stopPdfWorker(): Promise<void> {
  const child = worker;
  worker = null;
  failAll(new FieldPlacementError('invalid_pdf', 'pdf worker stopped'));
  if (!child) return;
  await child.terminate();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const child = new Worker(WORKER_SOURCE, { eval: true });
  child.unref();
  child.on('message', (message: unknown) => {
    if (!isRecord(message) || typeof message.id !== 'number') return;
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    if (message.ok === true) job.resolve(message.result);
    else {
      const text = typeof message.message === 'string' ? message.message : 'pdf worker failed';
      job.reject(new FieldPlacementError('invalid_pdf', text));
    }
  });
  child.on('error', (err: Error) => {
    if (worker === child) worker = null;
    failAll(
      err instanceof FieldPlacementError
        ? err
        : new FieldPlacementError('invalid_pdf', err.message),
    );
  });
  child.on('exit', (code) => {
    if (worker !== child) return;
    worker = null;
    if (pending.size > 0) {
      failAll(new FieldPlacementError('invalid_pdf', `pdf worker exited ${code}`));
    }
  });
  worker = child;
  return child;
}

function call(op: string, extra: Record<string, unknown>): Promise<unknown> {
  const run = queue.then(() => dispatch(op, extra));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function dispatch(op: string, extra: Record<string, unknown>): Promise<unknown> {
  const child = ensureWorker();
  const id = nextId;
  nextId += 1;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.postMessage({
      id,
      op,
      pdfjsHref: PDFJS_HREF,
      ...extra,
    });
  });
}

function numberList(value: unknown, count: number): readonly number[] | null {
  if (!Array.isArray(value) || value.length < count) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = value[i];
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    out.push(item);
  }
  return out;
}

function readFlag(value: unknown): boolean {
  return value === true;
}

function readInspection(value: unknown): PdfjsInspection {
  if (
    !isRecord(value) ||
    !Array.isArray(value.pages) ||
    !Array.isArray(value.textItems) ||
    !Array.isArray(value.widgets)
  ) {
    throw new FieldPlacementError('invalid_pdf', 'pdf.js inspection was empty');
  }
  const pages: PdfjsPageSnapshot[] = [];
  for (const page of value.pages) {
    if (!isRecord(page) || typeof page.page !== 'number' || typeof page.width !== 'number') {
      throw new FieldPlacementError('invalid_pdf', 'pdf.js page was unreadable');
    }
    if (typeof page.height !== 'number' || typeof page.rotate !== 'number') {
      throw new FieldPlacementError('invalid_pdf', 'pdf.js page was unreadable');
    }
    const transform = numberList(page.transform, 6);
    if (!transform) throw new FieldPlacementError('invalid_pdf', 'pdf.js page was unreadable');
    pages.push({
      page: page.page,
      width: page.width,
      height: page.height,
      rotate: page.rotate,
      transform,
    });
  }
  const textItems: PdfjsTextSnapshot[] = [];
  for (const item of value.textItems) {
    if (!isRecord(item) || typeof item.str !== 'string' || typeof item.page !== 'number') continue;
    if (typeof item.width !== 'number' || typeof item.height !== 'number') continue;
    const transform = numberList(item.transform, 6);
    if (!transform) continue;
    textItems.push({
      page: item.page,
      str: item.str,
      transform,
      width: item.width,
      height: item.height,
    });
  }
  const widgets: PdfjsWidgetSnapshot[] = [];
  for (const widget of value.widgets) {
    if (
      !isRecord(widget) ||
      typeof widget.fieldName !== 'string' ||
      typeof widget.page !== 'number'
    ) {
      continue;
    }
    const rect = numberList(widget.rect, 4);
    if (!rect) continue;
    const fieldType = typeof widget.fieldType === 'string' ? widget.fieldType : 'unknown';
    widgets.push({
      page: widget.page,
      fieldName: widget.fieldName,
      fieldType,
      rect,
      checkBox: readFlag(widget.checkBox),
      radioButton: readFlag(widget.radioButton),
      pushButton: readFlag(widget.pushButton),
      combo: readFlag(widget.combo),
    });
  }
  return { pages, textItems, widgets };
}

export async function inspectWithPdfjs(bytes: Uint8Array): Promise<PdfjsInspection> {
  return readInspection(await call('inspect', { bytes }));
}

export async function listPdfPathBounds(bytes: Uint8Array): Promise<PdfPathBound[]> {
  const value = await call('paths', { bytes });
  if (!isRecord(value) || !Array.isArray(value.bounds)) {
    throw new FieldPlacementError('invalid_pdf', 'pdf.js did not return path bounds');
  }
  const bounds: PdfPathBound[] = [];
  for (const bound of value.bounds) {
    if (!isRecord(bound)) continue;
    if (typeof bound.x !== 'number' || typeof bound.y !== 'number') continue;
    if (typeof bound.width !== 'number' || typeof bound.height !== 'number') continue;
    bounds.push({ x: bound.x, y: bound.y, width: bound.width, height: bound.height });
  }
  return bounds;
}
