import type { PlacementBox, PlacementKind } from 'shared';
import { PDFDocument } from 'pdf-lib';
import {
  displayedBoxFromPdfRect,
  pdfPointToDisplayed,
  viewportFromTransform,
  type PdfViewport,
} from './displayed-page';
import { FieldPlacementError } from './field-placement.errors';
import type { DisplayedBox, FormWidgetType, PageSize } from './field-placement.types';
import {
  inspectWithPdfjs,
  listPdfPathBounds,
  type PdfjsTextSnapshot,
  type PdfjsWidgetSnapshot,
  type PdfPathBound,
} from './pdfjs-host';
import { groupTextLines, type TextLine, type TextPiece } from './text-index';

export interface PageGeometry {
  readonly info: PageSize;
  readonly viewport: PdfViewport;
}

export interface LoadedFormField {
  readonly page: number;
  readonly name: string;
  readonly type: FormWidgetType;
  readonly box: PlacementBox;
  readonly suggested_kind: PlacementKind;
}

export interface LoadedDocument {
  readonly bytes: Uint8Array;
  readonly pageCount: number;
  readonly pages: readonly PageGeometry[];
  readonly words: readonly TextPiece[];
  readonly lines: readonly TextLine[];
  readonly formFields: readonly LoadedFormField[];
}

export function normalizeRotation(angle: number): 0 | 90 | 180 | 270 {
  const turns = ((Math.round(angle) % 360) + 360) % 360;
  if (turns === 90 || turns === 180 || turns === 270) return turns;
  return 0;
}

function asPlacement(box: DisplayedBox): PlacementBox {
  return { x: box.x, y: box.y, width: box.w, height: box.h };
}

function textPieceBox(item: PdfjsTextSnapshot, viewport: PdfViewport): DisplayedBox {
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

function widgetDisplayed(rect: readonly number[], viewport: PdfViewport): DisplayedBox | null {
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

export function classifyWidget(widget: PdfjsWidgetSnapshot): FormWidgetType | null {
  if (widget.fieldType === 'Sig') return 'Signature';
  if (widget.fieldType === 'Tx') return 'Text';
  if (widget.fieldType === 'Ch') return widget.combo ? 'ComboBox' : 'ListBox';
  if (widget.fieldType !== 'Btn') return null;
  if (widget.pushButton) return 'PushButton';
  if (widget.radioButton) return 'RadioButton';
  if (widget.checkBox) return 'CheckBox';
  return null;
}

export function suggestedKind(type: FormWidgetType, name: string): PlacementKind {
  const normalized = name.toLowerCase();
  if (normalized.startsWith('sig')) return 'signature';
  if (normalized.startsWith('init')) return 'initials';
  if (normalized.startsWith('date')) return 'date';
  if (normalized.startsWith('email')) return 'email';
  if (normalized.startsWith('name')) return 'name';
  if (normalized.includes('checkbox')) return 'checkbox';
  if (type === 'Signature') return 'signature';
  if (type === 'CheckBox') return 'checkbox';
  return 'text';
}

export async function loadPdf(bytes: Uint8Array): Promise<LoadedDocument> {
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
  const viewports = new Map<number, PdfViewport>();

  for (const raw of snapshot.pages) {
    const libPage = libPages[raw.page - 1];
    if (!libPage) throw new FieldPlacementError('invalid_pdf', `page ${raw.page} is missing`);
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

  const words: TextPiece[] = [];
  for (const item of snapshot.textItems) {
    const viewport = viewports.get(item.page);
    if (!viewport) continue;
    words.push({
      page: item.page,
      text: item.str,
      box: asPlacement(textPieceBox(item, viewport)),
    });
  }

  const formFields: LoadedFormField[] = [];
  for (const widget of snapshot.widgets) {
    const viewport = viewports.get(widget.page);
    if (!viewport) continue;
    const type = classifyWidget(widget);
    const displayed = widgetDisplayed(widget.rect, viewport);
    if (!type || !displayed) continue;
    formFields.push({
      page: widget.page,
      name: widget.fieldName,
      type,
      box: asPlacement(displayed),
      suggested_kind: suggestedKind(type, widget.fieldName),
    });
  }
  formFields.sort((a, b) => a.page - b.page || a.box.y - b.box.y || a.box.x - b.box.x);

  return {
    bytes: new Uint8Array(bytes),
    pageCount: pages.length,
    pages,
    words,
    lines: groupTextLines(words),
    formFields,
  };
}

export async function listPathBounds(bytes: Uint8Array): Promise<PdfPathBound[]> {
  return listPdfPathBounds(bytes);
}
