import { PDFDocument } from 'pdf-lib';
import { isFeatureEnabled, type AnyFieldKind, type ResolvedTemplateField } from 'shared';
import { normalizeRect } from '../envelopes/coord';
import type { CreateFieldInput } from '../envelopes/envelopes.repository';

/** The editor's fixed canvas width; template coordinates are pixels on it. */
export const TEMPLATE_CANVAS_WIDTH = 560;

/** Default box per kind in canvas pixels (same table the editor sends with). */
const DEFAULT_PX: Record<string, { readonly w: number; readonly h: number }> = {
  signature: { w: 200, h: 54 },
  initials: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
  name: { w: 240, h: 36 },
  number: { w: 140, h: 36 },
  radio: { w: 200, h: 72 },
  dropdown: { w: 200, h: 36 },
};

/** Canvas height the editor used for a document whose first page is `w` by `h`. */
export async function canvasHeightOf(
  pdf: Buffer,
): Promise<{ pages: number; canvasHeight: number }> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const first = doc.getPage(0).getSize();
  return {
    pages: doc.getPageCount(),
    canvasHeight: first.width > 0 ? (TEMPLATE_CANVAS_WIDTH * first.height) / first.width : 740,
  };
}

/**
 * Convert a template layout, already expanded onto this document by
 * `TemplateApplyService` (server-side expansion, the same
 * `expandTemplateFields` the SPA uses), to the envelope's field rows. Each field
 * goes to the signer of its slot; `slotOf` maps a role id to the 0-based slot
 * and `signerIds[slot]` is that slot's envelope signer.
 */
export function placementsFor(
  resolved: ReadonlyArray<ResolvedTemplateField>,
  doc: { readonly pages: number; readonly canvasHeight: number },
  slotOf: ReadonlyMap<string | null, number>,
  signerIds: ReadonlyArray<string>,
): CreateFieldInput[] {
  const metaOn = isFeatureEnabled('fieldMetaV2');
  const out: CreateFieldInput[] = [];
  for (const f of resolved) {
    // `expandTemplateFields` already backfilled the role from `signerIndex`.
    const role = f.signerRoleId ?? null;
    const slot = slotOf.get(role) ?? 0;
    const signerId = signerIds[slot];
    if (signerId === undefined) continue;
    const kind: AnyFieldKind = f.type === 'initial' ? 'initials' : f.type;
    const px = DEFAULT_PX[kind] ?? DEFAULT_PX['text'];
    const rect = normalizeRect(
      { x: f.x, y: f.y, width: px?.w ?? 240, height: px?.h ?? 36 },
      { width: TEMPLATE_CANVAS_WIDTH, height: doc.canvasHeight },
    );
    const required = typeof f.meta?.['required'] === 'boolean' ? f.meta['required'] : true;
    out.push({
      signer_id: signerId,
      kind,
      page: f.page,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      required,
      ...(f.linkId !== undefined ? { link_id: f.linkId } : {}),
      ...(metaOn ? { meta: f.meta ?? {} } : {}),
    });
  }
  return out;
}
