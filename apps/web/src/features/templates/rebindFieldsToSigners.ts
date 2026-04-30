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
 * Apply the user-spec signer-count rules to a resolved-template field
 * set, projecting each field onto the active envelope roster.
 *
 * Three cases (driven by each field's saved `signerIndex` ordinal):
 *
 *   1. `signerIndex` defined AND `< signers.length` — bind to
 *      `signers[signerIndex]` so per-signer colors & assignments
 *      survive the round-trip even when the user replaced the signers.
 *      Identity doesn't matter; the ordinal does.
 *
 *   2. `signerIndex` defined AND `>= signers.length` — DROP the field.
 *      The user removed a signer, so their fields go with them. This
 *      replaces the previous fallback-to-signers[0], which collapsed
 *      every "extra" field onto signer #0 and looked like duplicate
 *      signatures (the original bug).
 *
 *   3. `signerIndex` undefined (legacy templates saved before signer
 *      indexing was added) — fall back to `signers[0]` for back-compat.
 *      If the roster is empty, drop. The user can still rebind in the
 *      editor.
 *
 * Extra signers (those at indexes the original template never used)
 * automatically get no preset fields — the per-field loop only emits
 * fields the template originally placed, so "more signers than the
 * template" naturally produces empty assignments for the new signers
 * (the user adds those fields manually in the editor).
 */
export function rebindFieldsToSigners(
  resolved: ReadonlyArray<ResolvedField>,
  signers: ReadonlyArray<RebindSigner>,
): ReadonlyArray<PlacedFieldValue> {
  const out: PlacedFieldValue[] = [];
  for (const rf of resolved) {
    let targetSignerId: string | undefined;
    if (rf.signerIndex !== undefined) {
      // Saved-with-index path: bind by ordinal, drop on out-of-range.
      if (rf.signerIndex >= signers.length) continue;
      targetSignerId = signers[rf.signerIndex]?.id;
    } else {
      // Legacy path: best-effort fallback to signers[0].
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
