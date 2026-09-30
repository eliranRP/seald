import { randomUUID } from 'node:crypto';
import type { FieldKind } from 'shared';
import { defaultHeight, defaultWidth } from '../sealing/burn-in-fields';
import { displayedBoxToStored, storedBoxToDisplayed } from './displayed-page';
import type { PageGeometry } from './pdf-document';
import { FieldPlacementError } from './field-placement.errors';
import type {
  AcroFormFieldInfo,
  AnchorPosition,
  AnchorSpec,
  DisplayedBox,
  FieldIssue,
  FieldTypeInput,
  PageSize,
  PlacedField,
  PlacementInput,
  SignerRef,
  TextRun,
} from './field-placement.types';
import { ANCHOR_POSITIONS, FIELD_TYPE_INPUTS } from './field-placement.types';

const SIGNER_COLORS = ['#F472B6', '#7DD3FC', '#10B981', '#F59E0B', '#818CF8'] as const;
const MAX_FIELDS = 500;

export interface ResolvedPlacement {
  readonly field: PlacedField | null;
  /** Displayed box before fraction rounding. Null when the field was not placed. */
  readonly requested: DisplayedBox | null;
  readonly error: FieldIssue | null;
}

function isFieldType(value: string): value is FieldTypeInput {
  return (FIELD_TYPE_INPUTS as readonly string[]).includes(value);
}

function isAnchorPosition(value: string): value is AnchorPosition {
  return (ANCHOR_POSITIONS as readonly string[]).includes(value);
}

export function mapFieldType(type: FieldTypeInput): { kind: FieldKind; linkId: string | null } {
  if (type === 'name') return { kind: 'text', linkId: 'name' };
  return { kind: type, linkId: null };
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pageByNumber(pages: readonly PageGeometry[], page: number): PageGeometry | undefined {
  return pages.find((item) => item.info.page === page);
}

function issue(
  code: FieldIssue['code'],
  message: string,
  extra: {
    fieldId?: string | null;
    signerId?: string | null;
    page?: number | null;
    box?: DisplayedBox | null;
  },
): FieldIssue {
  return {
    code,
    severity: 'error',
    fieldId: extra.fieldId ?? null,
    signerId: extra.signerId ?? null,
    message,
    page: extra.page ?? null,
    box: extra.box ?? null,
  };
}

function signerColor(seen: Map<string, string>, signer: SignerRef): string {
  const explicit = signer.color;
  if (explicit && /^#[0-9A-Fa-f]{6}$/.test(explicit)) {
    seen.set(signer.id, explicit);
    return explicit;
  }
  const previous = seen.get(signer.id);
  if (previous) return previous;
  const next = SIGNER_COLORS[seen.size % SIGNER_COLORS.length] ?? SIGNER_COLORS[0];
  seen.set(signer.id, next);
  return next;
}

function defaultSize(kind: FieldKind, page: PageSize): { w: number; h: number } {
  return {
    w: defaultWidth(kind) * page.width,
    h: defaultHeight(kind) * page.height,
  };
}

function toPlaced(
  input: PlacementInput,
  box: DisplayedBox,
  page: PageGeometry,
  color: string,
  id: string,
): PlacedField {
  const mapped = mapFieldType(input.type);
  const stored = displayedBoxToStored(box, page.info);
  const width = stored.width ?? 0;
  const height = stored.height ?? 0;
  const finalBox = storedBoxToDisplayed({ x: stored.x, y: stored.y, width, height }, page.info);
  return {
    id,
    signer_id: input.signer.id,
    signer_name:
      input.signer.name && input.signer.name.length > 0 ? input.signer.name : input.signer.id,
    signer_color: color,
    kind: mapped.kind,
    link_id: mapped.linkId,
    page: page.info.page,
    x: stored.x,
    y: stored.y,
    width,
    height,
    required: input.required ?? true,
    box: finalBox,
  };
}

function clusterLines(runs: readonly TextRun[]): TextRun[][] {
  const sorted = [...runs].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines: TextRun[][] = [];
  for (const run of sorted) {
    const line = lines.find((group) => {
      const head = group[0];
      if (!head || head.page !== run.page) return false;
      const overlap = Math.min(head.y + head.h, run.y + run.h) - Math.max(head.y, run.y);
      return overlap > Math.min(head.h, run.h) * 0.5;
    });
    if (line) line.push(run);
    else lines.push([run]);
  }
  return lines;
}

function sliceRun(run: TextRun, from: number, to: number): DisplayedBox {
  const length = Math.max(run.text.length, 1);
  const start = from / length;
  const end = to / length;
  if (run.h > run.w) {
    return { x: run.x, y: run.y + run.h * start, w: run.w, h: run.h * (end - start) };
  }
  return { x: run.x + run.w * start, y: run.y, w: run.w * (end - start), h: run.h };
}

function unionBoxes(boxes: readonly DisplayedBox[]): DisplayedBox {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.w;
  let maxY = first.y + first.h;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function lineMatches(runs: readonly TextRun[], query: string): DisplayedBox[] {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  let text = '';
  const segments: Array<{ run: TextRun; start: number; end: number }> = [];
  let previous: TextRun | null = null;
  for (const run of sorted) {
    if (previous) {
      const gap = run.x - (previous.x + previous.w);
      if (gap > 1.5) text += ' ';
    }
    const start = text.length;
    text += run.text;
    segments.push({ run, start, end: text.length });
    previous = run;
  }
  const found: DisplayedBox[] = [];
  let from = 0;
  while (from <= text.length - query.length) {
    const at = text.indexOf(query, from);
    if (at < 0) break;
    const end = at + query.length;
    const pieces: DisplayedBox[] = [];
    for (const segment of segments) {
      const overlapStart = Math.max(at, segment.start);
      const overlapEnd = Math.min(end, segment.end);
      if (overlapEnd <= overlapStart) continue;
      const localStart = overlapStart - segment.start;
      const localEnd = overlapEnd - segment.start;
      if (localStart === 0 && localEnd === segment.run.text.length) {
        pieces.push(segment.run);
      } else {
        pieces.push(sliceRun(segment.run, localStart, localEnd));
      }
    }
    if (pieces.length > 0) found.push(unionBoxes(pieces));
    from = at + Math.max(query.length, 1);
  }
  return found;
}

export interface TextHit {
  readonly page: number;
  readonly box: DisplayedBox;
}

export function findTextBoxes(runs: readonly TextRun[], anchor: AnchorSpec): TextHit[] {
  const query = anchor.text;
  if (query.trim().length === 0) return [];
  const scoped = anchor.page === undefined ? runs : runs.filter((run) => run.page === anchor.page);
  const hits: TextHit[] = [];
  for (const line of clusterLines(scoped)) {
    const page = line[0]?.page;
    if (page === undefined) continue;
    for (const box of lineMatches(line, query)) hits.push({ page, box });
  }
  return hits;
}

function placeOnText(
  text: DisplayedBox,
  position: AnchorPosition,
  size: { w: number; h: number },
  offset: { x: number; y: number },
): DisplayedBox {
  if (position === 'before') {
    return { x: text.x - size.w + offset.x, y: text.y + offset.y, w: size.w, h: size.h };
  }
  if (position === 'after') {
    return { x: text.x + text.w + offset.x, y: text.y + offset.y, w: size.w, h: size.h };
  }
  if (position === 'above') {
    return { x: text.x + offset.x, y: text.y - size.h + offset.y, w: size.w, h: size.h };
  }
  if (position === 'below') {
    return { x: text.x + offset.x, y: text.y + text.h + offset.y, w: size.w, h: size.h };
  }
  return {
    x: text.x + (text.w - size.w) / 2 + offset.x,
    y: text.y + (text.h - size.h) / 2 + offset.y,
    w: size.w,
    h: size.h,
  };
}

function hasCoordinate(input: PlacementInput): input is PlacementInput & {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (
    !('page' in input) ||
    !('x' in input) ||
    !('y' in input) ||
    !('w' in input) ||
    !('h' in input)
  ) {
    return false;
  }
  return (
    finite(input.page) && finite(input.x) && finite(input.y) && finite(input.w) && finite(input.h)
  );
}

export function resolvePlacement(
  input: PlacementInput,
  pages: readonly PageGeometry[],
  textRuns: readonly TextRun[],
  acroFormFields: readonly AcroFormFieldInfo[],
  colors: Map<string, string>,
  id: string = randomUUID(),
): ResolvedPlacement {
  if (!input.signer || typeof input.signer.id !== 'string' || input.signer.id.length === 0) {
    throw new FieldPlacementError('invalid_placement', 'Each field needs a signer id.');
  }
  if (!isFieldType(input.type)) {
    throw new FieldPlacementError(
      'invalid_placement',
      `Unknown field type "${String(input.type)}".`,
    );
  }
  const color = signerColor(colors, input.signer);
  const located = locate(input, pages, textRuns, acroFormFields);
  if (located.error) {
    return {
      field: null,
      requested: located.box,
      error: { ...located.error, signerId: input.signer.id },
    };
  }
  const locatedBox = located.box;
  const locatedPage = located.page;
  if (!locatedBox || !locatedPage) {
    throw new FieldPlacementError('invalid_placement', 'Field location was not resolved.');
  }
  return {
    field: toPlaced(input, locatedBox, locatedPage, color, id),
    requested: locatedBox,
    error: null,
  };
}

function locate(
  input: PlacementInput,
  pages: readonly PageGeometry[],
  textRuns: readonly TextRun[],
  acroFormFields: readonly AcroFormFieldInfo[],
): { box: DisplayedBox | null; page: PageGeometry | null; error: FieldIssue | null } {
  const anchor = 'anchor' in input ? input.anchor : undefined;
  const acroName = 'acroformField' in input ? input.acroformField : undefined;
  const coordinate = hasCoordinate(input);
  const modes = [coordinate, anchor !== undefined, acroName !== undefined].filter(Boolean).length;
  if (modes !== 1) {
    throw new FieldPlacementError(
      'invalid_placement',
      'Each field needs exactly one of a point box, an anchor, or an AcroForm field name.',
    );
  }
  if (coordinate) {
    return locateBox(input, pages);
  }
  if (anchor) {
    return locateAnchor(input, anchor, pages, textRuns);
  }
  return locateAcroForm(acroName ?? '', pages, acroFormFields);
}

function locateBox(
  input: PlacementInput & { page: number; x: number; y: number; w: number; h: number },
  pages: readonly PageGeometry[],
): { box: DisplayedBox | null; page: PageGeometry | null; error: FieldIssue | null } {
  if (!Number.isInteger(input.page)) {
    throw new FieldPlacementError('invalid_placement', 'page must be an integer.');
  }
  if (![input.x, input.y, input.w, input.h].every(finite)) {
    throw new FieldPlacementError('invalid_placement', 'x, y, w, and h must be finite numbers.');
  }
  const page = pageByNumber(pages, input.page);
  if (!page) {
    return {
      box: { x: input.x, y: input.y, w: input.w, h: input.h },
      page: null,
      error: issue('page_not_found', `Page ${input.page} is not in this document.`, {
        page: input.page,
        box: { x: input.x, y: input.y, w: input.w, h: input.h },
      }),
    };
  }
  return {
    box: { x: input.x, y: input.y, w: input.w, h: input.h },
    page,
    error: null,
  };
}

function locateAnchor(
  input: PlacementInput,
  anchor: AnchorSpec,
  pages: readonly PageGeometry[],
  textRuns: readonly TextRun[],
): { box: DisplayedBox | null; page: PageGeometry | null; error: FieldIssue | null } {
  if (typeof anchor.text !== 'string' || !isAnchorPosition(anchor.position)) {
    throw new FieldPlacementError('invalid_placement', 'Anchor needs text and a position.');
  }
  if (anchor.page !== undefined) {
    if (!Number.isInteger(anchor.page) || !pageByNumber(pages, anchor.page)) {
      return {
        box: null,
        page: null,
        error: issue('page_not_found', `Page ${String(anchor.page)} is not in this document.`, {
          page: anchor.page,
        }),
      };
    }
  }
  const matches = findTextBoxes(textRuns, anchor);
  const occurrence = anchor.occurrence ?? 1;
  const match = occurrence >= 1 ? matches[occurrence - 1] : undefined;
  if (!match) {
    return {
      box: null,
      page: null,
      error: issue(
        'anchor_not_found',
        `No occurrence ${occurrence} of "${anchor.text}" in this document.`,
        { page: anchor.page ?? null },
      ),
    };
  }
  const resolvedPage = pageByNumber(pages, match.page);
  if (!resolvedPage) {
    return {
      box: match.box,
      page: null,
      error: issue('page_not_found', 'Anchor text is not on a known page.', {
        page: match.page,
        box: match.box,
      }),
    };
  }
  const kind = mapFieldType(input.type).kind;
  const size = fieldSize(input, kind, resolvedPage.info);
  const offset = { x: anchor.offset?.x ?? 0, y: anchor.offset?.y ?? 0 };
  if (!finite(offset.x) || !finite(offset.y) || !finite(size.w) || !finite(size.h)) {
    throw new FieldPlacementError(
      'invalid_placement',
      'Anchor offset and size must be finite numbers.',
    );
  }
  return {
    box: placeOnText(match.box, anchor.position, size, offset),
    page: resolvedPage,
    error: null,
  };
}

function fieldSize(
  input: PlacementInput,
  kind: FieldKind,
  page: PageSize,
): { w: number; h: number } {
  const w = 'w' in input ? input.w : undefined;
  const h = 'h' in input ? input.h : undefined;
  if (w === undefined && h === undefined) return defaultSize(kind, page);
  if (w === undefined || h === undefined) {
    throw new FieldPlacementError('invalid_placement', 'Provide both w and h, or neither.');
  }
  return { w, h };
}

function locateAcroForm(
  name: string,
  pages: readonly PageGeometry[],
  acroFormFields: readonly AcroFormFieldInfo[],
): { box: DisplayedBox | null; page: PageGeometry | null; error: FieldIssue | null } {
  if (name.length === 0) {
    throw new FieldPlacementError('invalid_placement', 'acroformField name is empty.');
  }
  const widget = acroFormFields.find((field) => field.name === name);
  if (!widget) {
    return {
      box: null,
      page: null,
      error: issue('anchor_not_found', `AcroForm field "${name}" was not found.`, {}),
    };
  }
  const page = pageByNumber(pages, widget.page);
  if (!page) {
    return {
      box: widget,
      page: null,
      error: issue(
        'page_not_found',
        `AcroForm field "${name}" is on missing page ${widget.page}.`,
        {
          page: widget.page,
          box: widget,
        },
      ),
    };
  }
  return {
    box: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
    page,
    error: null,
  };
}

export function assertFieldCount(count: number): void {
  if (count > MAX_FIELDS) {
    throw new FieldPlacementError(
      'invalid_placement',
      `At most ${MAX_FIELDS} fields can be placed at once.`,
    );
  }
}
