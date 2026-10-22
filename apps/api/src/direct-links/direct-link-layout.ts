import type { AnyFieldKind, ResolvedTemplateField } from 'shared';
import { roundCoord, clampUnit } from '../envelopes/coord';
import {
  normalizeFieldPlacements,
  type NormalizedFieldPlacement,
} from '../envelopes/field-placement.service';

/**
 * The template editor stores a field's `x` and `y` in pixels of a canvas
 * 560 wide whose height follows the first page's aspect ratio
 * (`apps/web/src/lib/canvas-coords.ts`). The send path turns those into
 * 0-1 fractions; this is the same arithmetic, run on the server, so an
 * envelope made from a direct link places fields exactly where the owner's
 * own use-template send would.
 */
export const EDITOR_CANVAS_WIDTH = 560;

/** Default box sizes in editor pixels, per kind (the editor's `DEFAULT_PX`). */
const DEFAULT_BOX_PX: Readonly<Record<string, { readonly w: number; readonly h: number }>> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
  name: { w: 240, h: 36 },
  number: { w: 140, h: 36 },
  radio: { w: 200, h: 72 },
  dropdown: { w: 200, h: 36 },
};
const FALLBACK_BOX_PX = { w: 240, h: 36 } as const;

export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** A template type names a field kind; only `initial` is spelled differently. */
export function fieldKindOf(type: ResolvedTemplateField['type']): AnyFieldKind {
  return (type === 'initial' ? 'initials' : type) as AnyFieldKind;
}

/**
 * Turn the server-expanded template fields into placements for the new
 * envelope. A field whose owner slot is not on the envelope is dropped,
 * like the web's `rebindFieldsToSigners` does for a removed signer. `meta`
 * is carried only while field meta v2 is on.
 */
export function placementsFromTemplate(
  fields: ReadonlyArray<ResolvedTemplateField>,
  firstPage: PageSize,
  signerIdBySlot: ReadonlyMap<string, string>,
  opts: { readonly keepMeta: boolean },
): NormalizedFieldPlacement[] {
  const canvasHeight = EDITOR_CANVAS_WIDTH * (firstPage.height / firstPage.width);
  const out = [];
  for (const f of fields) {
    if (f.signerRoleId === undefined) continue;
    const signerId = signerIdBySlot.get(f.signerRoleId);
    if (signerId === undefined) continue;
    const kind = fieldKindOf(f.type);
    const box = DEFAULT_BOX_PX[kind] ?? FALLBACK_BOX_PX;
    out.push({
      signer_id: signerId,
      kind,
      page: f.page,
      x: roundCoord(clampUnit(f.x / EDITOR_CANVAS_WIDTH)),
      y: roundCoord(clampUnit(f.y / canvasHeight)),
      width: roundCoord(clampUnit(box.w / EDITOR_CANVAS_WIDTH)),
      height: roundCoord(clampUnit(box.h / canvasHeight)),
      ...(f.linkId !== undefined ? { link_id: f.linkId } : {}),
      ...(opts.keepMeta && f.meta !== undefined ? { meta: f.meta } : {}),
    });
  }
  return normalizeFieldPlacements(out);
}

/** Whether `slot` owns at least one signature or initials field in the layout. */
export function slotHasSignatureField(
  fields: ReadonlyArray<ResolvedTemplateField>,
  slot: string,
): boolean {
  return fields.some(
    (f) => f.signerRoleId === slot && (f.type === 'signature' || f.type === 'initial'),
  );
}
