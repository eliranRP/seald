import {
  getFieldDef,
  resolveApplyPages,
  type MobileApplyMode,
  type MobileFieldType,
  type MobilePlacedField,
  type MobileStep,
} from './types';

/**
 * Pure helpers that drive the place-step interactions. Kept outside the React
 * component so the parity-with-desktop logic (drop → multi-signer split,
 * tap-toggle, apply-to-pages, drag clamping) can be tested directly.
 *
 * Coordinate space is canvas-local pixels. Drag clamping uses the canvas
 * width/height passed in by the renderer — there's no module-level constant
 * because real device viewports vary.
 */

export interface CanvasBounds {
  readonly width: number;
  readonly height: number;
}

let dropCounter = 0;
function nextFieldId(prefix: string): string {
  dropCounter += 1;
  // Date.now() alone collides under fast successive drops in tests; the
  // counter guarantees uniqueness without dragging in a uuid library.
  return `${prefix}_${Date.now().toString(36)}_${dropCounter.toString(36)}`;
}

export interface DropOptions {
  readonly type: MobileFieldType;
  readonly page: number;
  readonly position: { readonly x: number; readonly y: number };
  /** First signer's id is assigned to the placeholder. May be undefined when
   *  no signers are configured yet — the field renders as unassigned. */
  readonly firstSignerId: string | undefined;
}

/** Return the new field that would be appended on a canvas tap. */
export function buildDroppedField(opts: DropOptions): MobilePlacedField {
  const def = getFieldDef(opts.type);
  return {
    id: nextFieldId('f'),
    type: opts.type,
    page: opts.page,
    x: Math.max(8, opts.position.x - def.w / 2),
    y: Math.max(8, opts.position.y - def.h / 2),
    signerIds: opts.firstSignerId ? [opts.firstSignerId] : [],
    linkedPages: [opts.page],
  };
}

/** Tap-toggle a field id in/out of the current selection.
 *  When `replace` is true the selection is reset to `[fieldId]`. */
export function toggleSelection(
  current: ReadonlyArray<string>,
  fieldId: string,
  replace: boolean,
): ReadonlyArray<string> {
  if (replace) return [fieldId];
  if (current.includes(fieldId)) return current.filter((id) => id !== fieldId);
  return [...current, fieldId];
}

export interface DragCommitOptions {
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly ids: ReadonlyArray<string>;
  readonly dx: number;
  readonly dy: number;
  readonly bounds: CanvasBounds;
}

/** Translate the named fields by (dx,dy), clamped to the canvas. */
export function commitDrag(opts: DragCommitOptions): ReadonlyArray<MobilePlacedField> {
  return opts.fields.map((f) => {
    if (!opts.ids.includes(f.id)) return f;
    const def = getFieldDef(f.type);
    return {
      ...f,
      x: Math.max(8, Math.min(opts.bounds.width - def.w - 8, f.x + opts.dx)),
      y: Math.max(8, Math.min(opts.bounds.height - def.h - 8, f.y + opts.dy)),
    };
  });
}

export interface ApplyPagesOptions {
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly mode: MobileApplyMode;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly customPages: ReadonlyArray<number>;
}

export function applyPagesToSelection(opts: ApplyPagesOptions): ReadonlyArray<MobilePlacedField> {
  const pages = resolveApplyPages(opts.mode, opts.totalPages, opts.currentPage, opts.customPages);
  return opts.fields.map((f) =>
    opts.selectedIds.includes(f.id) ? { ...f, linkedPages: pages } : f,
  );
}

export interface AssignSignersOptions {
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly signerIds: ReadonlyArray<string>;
  readonly bounds: CanvasBounds;
}

export interface AssignSignersResult {
  readonly fields: ReadonlyArray<MobilePlacedField>;
  /** New ids that should become the next selection. */
  readonly nextSelection: ReadonlyArray<string>;
}

/**
 * Mirror of the desktop `usePlacement.applySignerSelection`:
 *
 *   - 0 or 1 signer chosen → reassign in place.
 *   - 2+ signers chosen → REPLACE every selected source field with N
 *     independent single-signer fields placed side-by-side at
 *     `source.x + idx * (def.w + 8)`, clamped to the canvas.
 *
 * The new ids are returned in `nextSelection` so the caller can seed the
 * selection — that lets the user immediately tap any one to "ungroup".
 */
export function assignSignersToSelection(opts: AssignSignersOptions): AssignSignersResult {
  if (opts.selectedIds.length === 0) {
    return { fields: opts.fields, nextSelection: [] };
  }
  const nextSelection: string[] = [];
  const out: MobilePlacedField[] = [];
  opts.fields.forEach((f) => {
    if (!opts.selectedIds.includes(f.id)) {
      out.push(f);
      return;
    }
    if (opts.signerIds.length <= 1) {
      out.push({ ...f, signerIds: opts.signerIds });
      nextSelection.push(f.id);
      return;
    }
    const def = getFieldDef(f.type);
    const stride = def.w + 8;
    const maxX = opts.bounds.width - def.w - 8;
    opts.signerIds.forEach((sid, idx) => {
      const nid = nextFieldId('f');
      out.push({
        ...f,
        id: nid,
        x: Math.min(maxX, f.x + idx * stride),
        signerIds: [sid],
      });
      nextSelection.push(nid);
    });
  });
  return { fields: out, nextSelection };
}

/** Drop the named ids from the field list. */
export function deleteFields(
  fields: ReadonlyArray<MobilePlacedField>,
  ids: ReadonlyArray<string>,
): ReadonlyArray<MobilePlacedField> {
  return fields.filter((f) => !ids.includes(f.id));
}

/** Visible fields on a given page (page-local OR linked). */
export function fieldsOnPage(
  fields: ReadonlyArray<MobilePlacedField>,
  page: number,
): ReadonlyArray<MobilePlacedField> {
  return fields.filter((f) => {
    const linked = f.linkedPages.length > 0 ? f.linkedPages : [f.page];
    return linked.includes(page);
  });
}

/** Pages that have at least one field linked (used by the filmstrip). */
export function pagesWithFields(fields: ReadonlyArray<MobilePlacedField>): ReadonlySet<number> {
  const s = new Set<number>();
  fields.forEach((f) => {
    const linked = f.linkedPages.length > 0 ? f.linkedPages : [f.page];
    linked.forEach((p) => s.add(p));
  });
  return s;
}

export const MOBILE_STEP_ORDER: ReadonlyArray<MobileStep> = [
  'start',
  'file',
  'signers',
  'place',
  'review',
  'sent',
];

export function previousStep(step: MobileStep): MobileStep {
  const i = MOBILE_STEP_ORDER.indexOf(step);
  if (i <= 0) return MOBILE_STEP_ORDER[0]!;
  return MOBILE_STEP_ORDER[i - 1] ?? step;
}

export function nextStep(step: MobileStep): MobileStep {
  const i = MOBILE_STEP_ORDER.indexOf(step);
  if (i < 0 || i >= MOBILE_STEP_ORDER.length - 1) return step;
  return MOBILE_STEP_ORDER[i + 1] ?? step;
}
