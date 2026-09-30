import { PDFDocument } from 'pdf-lib';
import {
  displayedBoxFromPdfRect,
  pdfPointToDisplayed,
  viewportFromTransform,
  type PdfViewport,
} from './displayed-page';
import { FieldPlacementError } from './field-placement.errors';
import type {
  AcroFormFieldInfo,
  DocumentInspection,
  PageSize,
  TextRun,
} from './field-placement.types';
import {
  inspectWithPdfjs,
  listPdfPathBounds,
  type PdfjsTextSnapshot,
  type PdfPathBound,
} from './pdfjs-host';

export interface PageGeometry {
  readonly info: PageSize;
  readonly viewport: PdfViewport;
}

export interface LoadedPdf {
  readonly bytes: Uint8Array;
  readonly pages: readonly PageGeometry[];
  readonly inspection: DocumentInspection;
}

export interface PdfRectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const turns = ((Math.round(angle) % 360) + 360) % 360;
  if (turns === 90 || turns === 180 || turns === 270) return turns;
  return 0;
}

function textRunBox(
  item: PdfjsTextSnapshot,
  viewport: PdfViewport,
): { x: number; y: number; w: number; h: number } {
  const a = item.transform[0] ?? 0;
  const b = item.transform[1] ?? 0;
  const c = item.transform[2] ?? 0;
  const d = item.transform[3] ?? 0;
  const e = item.transform[4] ?? 0;
  const f = item.transform[5] ?? 0;
  const along = Math.hypot(a, b) || 1;
  const up = Math.hypot(c, d) || 1;
  const height = item.height > 0 ? item.height : up;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [e, f],
    [e + (a / along) * item.width, f + (b / along) * item.width],
    [e + (c / up) * height, f + (d / up) * height],
    [
      e + (a / along) * item.width + (c / up) * height,
      f + (b / along) * item.width + (d / up) * height,
    ],
  ];
  const displayed = corners.map(([x, y]) => pdfPointToDisplayed(viewport, { x, y }));
  const xs = displayed.map((point) => point.x);
  const ys = displayed.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

function widgetBox(
  rect: readonly number[],
  viewport: PdfViewport,
): { x: number; y: number; w: number; h: number } | null {
  const x1 = rect[0];
  const y1 = rect[1];
  const x2 = rect[2];
  const y2 = rect[3];
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  return displayedBoxFromPdfRect(viewport, {
    x: minX,
    y: minY,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  });
}

export async function loadPdf(documentId: string, bytes: Uint8Array): Promise<LoadedPdf> {
  let snapshot;
  try {
    snapshot = await inspectWithPdfjs(bytes);
  } catch (err) {
    if (err instanceof FieldPlacementError) throw err;
    const message = err instanceof Error ? err.message : 'unreadable PDF';
    throw new FieldPlacementError('invalid_pdf', message);
  }

  const lib = await PDFDocument.load(bytes);
  const libPages = lib.getPages();
  const pages: PageGeometry[] = [];
  const textRuns: TextRun[] = [];
  const acroFormFields: AcroFormFieldInfo[] = [];
  const viewports = new Map<number, PdfViewport>();

  for (const raw of snapshot.pages) {
    const libPage = libPages[raw.page - 1];
    if (!libPage) {
      throw new FieldPlacementError('invalid_pdf', `page ${raw.page} is missing`);
    }
    const viewport = viewportFromTransform(raw.width, raw.height, raw.transform);
    viewports.set(raw.page, viewport);
    const media = libPage.getMediaBox();
    const crop = libPage.getCropBox();
    const info: PageSize = {
      page: raw.page,
      width: viewport.width,
      height: viewport.height,
      rotation: normalizeRotation(raw.rotate),
      mediaBox: { x: media.x, y: media.y, width: media.width, height: media.height },
      cropBox: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    };
    pages.push({ info, viewport });
  }

  for (const item of snapshot.textItems) {
    const viewport = viewports.get(item.page);
    if (!viewport) continue;
    const box = textRunBox(item, viewport);
    textRuns.push({ page: item.page, text: item.str, ...box });
  }

  for (const widget of snapshot.widgets) {
    const viewport = viewports.get(widget.page);
    if (!viewport) continue;
    const box = widgetBox(widget.rect, viewport);
    if (!box) continue;
    acroFormFields.push({
      name: widget.fieldName,
      page: widget.page,
      fieldType: widget.fieldType,
      ...box,
    });
  }

  return {
    bytes: new Uint8Array(bytes),
    pages,
    inspection: {
      documentId,
      pageCount: pages.length,
      pages: pages.map((page) => page.info),
      textRuns,
      acroFormFields,
    },
  };
}

export async function listPathBounds(bytes: Uint8Array): Promise<PdfPathBound[]> {
  return listPdfPathBounds(bytes);
}
