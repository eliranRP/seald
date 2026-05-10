import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { FieldKind } from '@/types/sealdTypes';
import type { TemplateFieldType } from 'shared';
import type { ResolvedField } from './templates';

/**
 * Editor field kinds use the singular/plural variants the design guide
 * picked (`initials`, `email` exist on the editor side; `initial` /
 * no-`email` on the template side). Centralized here so both reuse
 * paths (TemplateEditorRoute, UploadRoute) share the mapping without
 * duplicating it across routes.
 */
const TEMPLATE_TO_FIELD_KIND: Record<TemplateFieldType, FieldKind> = {
  signature: 'signature',
  initial: 'initials',
  date: 'date',
  text: 'text',
  checkbox: 'checkbox',
};

/**
 * Minimal signer shape we need to bind a saved `signerIndex` to a
 * concrete signer id. Callers pass either the freshly chosen wizard
 * roster (UploadRoute) or the editor's `draft.signers` (TemplateEditor).
 */
export interface RebindSigner {
  readonly id: string;
}

/**
 * Apply the user-spec signer-rebind rules to a resolved-template field
 * set, projecting each field onto the active envelope roster.
 *
 * Binding precedence (per field):
 *
 *   1. `signerRoleId` matches a signer's `id` in the roster — bind
 *      there. This is the canonical path for new templates AND for
 *      legacy templates after `resolveTemplateFields` backfills
 *      `signerRoleId` from `last_signers[signerIndex]`. Surviving the
 *      mid-list-removal shift bug (where removing signer A from
 *      [A, B] used to re-assign A's placements to B) depends on this
 *      step running before the ordinal fallback.
 *
 *   2. `signerRoleId` defined but no roster member matches — DROP.
 *      The signer that owned this field was removed from the active
 *      envelope; their placements go with them.
 *
 *   3. `signerIndex` defined AND `< signers.length` (legacy ordinal
 *      path, no `signerRoleId`) — bind by ordinal. Survives only on
 *      pre-fix templates that haven't been re-resolved with
 *      `lastSigners` yet.
 *
 *   4. `signerIndex` defined AND `>= signers.length` — DROP, same
 *      reasoning as case 2.
 *
 *   5. Neither defined (truly ancient templates) — best-effort
 *      fallback to `signers[0]`; if the roster is empty, drop.
 *
 * Extra signers (those past every saved binding) get no preset fields;
 * the per-field loop only emits what the template originally placed.
 */
export function rebindFieldsToSigners(
  resolved: ReadonlyArray<ResolvedField>,
  signers: ReadonlyArray<RebindSigner>,
): ReadonlyArray<PlacedFieldValue> {
  const signerById = new Map(signers.map((s) => [s.id, s]));
  const out: PlacedFieldValue[] = [];
  for (const rf of resolved) {
    let targetSignerId: string | undefined;
    if (rf.signerRoleId !== undefined) {
      // Stable-id path: drop when the role's owner is no longer in
      // the roster. Do NOT fall through to `signerIndex` — that
      // re-introduces the shift bug for legacy templates the
      // backfill already covered.
      const target = signerById.get(rf.signerRoleId);
      if (!target) continue;
      targetSignerId = target.id;
    } else if (rf.signerIndex !== undefined) {
      // Legacy ordinal path: bind by ordinal, drop on out-of-range.
      if (rf.signerIndex >= signers.length) continue;
      targetSignerId = signers[rf.signerIndex]?.id;
    } else {
      // Pre-signerIndex legacy: best-effort fallback to signers[0].
      targetSignerId = signers[0]?.id;
    }
    out.push({
      id: rf.id,
      page: rf.page,
      type: TEMPLATE_TO_FIELD_KIND[rf.type],
      x: rf.x,
      y: rf.y,
      signerIds: targetSignerId !== undefined ? [targetSignerId] : [],
      // Carry the linked-copy id through to the editor so the
      // "delete from all pages or just this one?" dialog fires when
      // the user removes one peer of a multi-page rule.
      ...(rf.linkId !== undefined ? { linkId: rf.linkId } : {}),
    });
  }
  return out;
}
