import { HttpException } from '@nestjs/common';
import type { PlacementBox, PlacementKind } from 'shared';
import { inspectPdfBytes, normalizePdfRotation } from '../envelopes/pdf-inspection';
import {
  displayedBoxFromPdfRect,
  pdfPointToDisplayed,
  viewportFromTransform,
  type PdfViewport,
} from './displayed-page';
import { FieldPlacementError } from './field-placement.errors';
import type { DisplayedBox, FormWidgetType, PageSize } from './field-placement.types';
import { inspectWithPdfjs, type PdfjsTextSnapshot, type PdfjsWidgetSnapshot } from './pdfjs-host';
import { groupTextLines, type TextLine, type TextPiece, type TextRun } from './text-index';

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

function asPlacement(box: DisplayedBox): PlacementBox {
  return { x: box.x, y: box.y, width: box.w, height: box.h };
}

function displayedDelta(
  viewport: PdfViewport,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const start = pdfPointToDisplayed(viewport, from);
  const end = pdfPointToDisplayed(viewport, to);
  return { x: end.x - start.x, y: end.y - start.y };
}

function textPieceGeometry(
  item: PdfjsTextSnapshot,
  viewport: PdfViewport,
): { readonly box: DisplayedBox; readonly run: TextRun } {
  const a = item.transform[0] ?? 0;
  const b = item.transform[1] ?? 0;
  const c = item.transform[2] ?? 0;
  const d = item.transform[3] ?? 0;
  const e = item.transform[4] ?? 0;
  const f = item.transform[5] ?? 0;
  const alongScale = Math.hypot(a, b) || 1;
  const upScale = Math.hypot(c, d) || 1;
  const height = item.height > 0 ? item.height : upScale;
  const advance: readonly [number, number] = [
    e + (a / alongScale) * item.width,
    f + (b / alongScale) * item.width,
  ];
  const raised: readonly [number, number] = [
    e + (c / upScale) * height,
    f + (d / upScale) * height,
  ];
  const corners: ReadonlyArray<readonly [number, number]> = [
    [e, f],
    advance,
    raised,
    [advance[0] + (c / upScale) * height, advance[1] + (d / upScale) * height],
  ];
  const origin = pdfPointToDisplayed(viewport, { x: e, y: f });
  const along = displayedDelta(viewport, { x: e, y: f }, { x: advance[0], y: advance[1] });
  const up = displayedDelta(viewport, { x: e, y: f }, { x: raised[0], y: raised[1] });
  const displayed = corners.map(([x, y]) => pdfPointToDisplayed(viewport, { x, y }));
  const xs = displayed.map((point) => point.x);
  const ys = displayed.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    box: { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY },
    run: {
      originX: origin.x,
      originY: origin.y,
      alongX: along.x,
      alongY: along.y,
      upX: up.x,
      upY: up.y,
    },
  };
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
  let inspected;
  try {
    inspected = await inspectPdfBytes(Buffer.from(bytes));
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new FieldPlacementError('invalid_pdf', 'unreadable PDF');
  }

  let snapshot;
  try {
    snapshot = await inspectWithPdfjs(bytes);
  } catch (err) {
    if (err instanceof HttpException) throw err;
    if (err instanceof FieldPlacementError) throw err;
    const message = err instanceof Error ? err.message : 'unreadable PDF';
    throw new FieldPlacementError('invalid_pdf', message);
  }

  const boxes = new Map(inspected.pageBoxes.map((page) => [page.page, page]));
  const pages: PageGeometry[] = [];
  const viewports = new Map<number, PdfViewport>();

  for (const raw of snapshot.pages) {
    const pageBox = boxes.get(raw.page);
    if (!pageBox) throw new FieldPlacementError('invalid_pdf', `page ${raw.page} is missing`);
    const viewport = viewportFromTransform(raw.width, raw.height, raw.transform);
    viewports.set(raw.page, viewport);
    const info: PageSize = {
      page: raw.page,
      width: viewport.width,
      height: viewport.height,
      rotation: normalizePdfRotation(raw.rotate),
      mediaBox: pageBox.mediaBox,
      cropBox: pageBox.cropBox,
    };
    pages.push({ info, viewport });
  }

  const words: TextPiece[] = [];
  for (const item of snapshot.textItems) {
    const viewport = viewports.get(item.page);
    if (!viewport) continue;
    const geometry = textPieceGeometry(item, viewport);
    words.push({
      page: item.page,
      text: item.str,
      box: asPlacement(geometry.box),
      run: geometry.run,
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
