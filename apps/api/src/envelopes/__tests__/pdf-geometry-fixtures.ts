import { PDFDocument, type PDFPage } from 'pdf-lib';

/**
 * Page-dictionary node we can walk without importing pdf-lib internals.
 * `Parent()` follows the inheritable MediaBox / CropBox chain.
 */
interface BoxNode {
  keys(): ReadonlyArray<{ decodeText(): string }>;
  delete(key: { decodeText(): string }): boolean;
  set(key: { decodeText(): string }, value: unknown): void;
  Parent(): BoxNode | undefined;
}

function asBoxNode(page: PDFPage): BoxNode {
  return page.node as unknown as BoxNode;
}

function boxKey(node: BoxNode, name: string): { decodeText(): string } | undefined {
  return node.keys().find((key) => key.decodeText() === name);
}

function stripBox(page: PDFPage, name: string): void {
  let node: BoxNode | undefined = asBoxNode(page);
  while (node) {
    const keys = [...node.keys()];
    for (const key of keys) {
      if (key.decodeText() === name) node.delete(key);
    }
    node = node.Parent();
  }
}

function replaceBox(page: PDFPage, doc: PDFDocument, name: string, values: number[]): void {
  page.setCropBox(0, 0, 1, 1);
  let node: BoxNode | undefined = asBoxNode(page);
  while (node) {
    const key = boxKey(node, name);
    if (key) {
      node.set(key, doc.context.obj(values));
      return;
    }
    node = node.Parent();
  }
  throw new Error(`${name} missing`);
}

/** No MediaBox and no CropBox. pdf.js treats this page as US Letter. */
export async function pdfWithoutMediaBox(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  stripBox(page, 'MediaBox');
  stripBox(page, 'CropBox');
  return Buffer.from(await doc.save());
}

/** CropBox has three numbers, so `asRectangle` throws. The MediaBox is 200×100. */
export async function pdfWithMalformedCropBox(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  replaceBox(page, doc, 'CropBox', [0, 0, 200]);
  return Buffer.from(await doc.save());
}

/** CropBox corners are stored reversed: [200 100 0 0]. */
export async function pdfWithReversedCropBox(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  replaceBox(page, doc, 'CropBox', [200, 100, 0, 0]);
  return Buffer.from(await doc.save());
}

/** CropBox extends past a 200×100 MediaBox. pdf.js clips to the intersection. */
export async function pdfWithOversizedCropBox(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 100]);
  page.setCropBox(0, 0, 450, 350);
  return Buffer.from(await doc.save());
}
