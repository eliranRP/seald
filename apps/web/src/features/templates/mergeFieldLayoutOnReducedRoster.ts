import type { TemplateField, TemplateLastSigner } from 'shared';

/**
 * Defensive merge helper for the "Send and update template" path in
 * `TemplateEditorRoute`. Resolves the user-reported bug where reusing
 * a template with FEWER signers than it was authored for and then
 * persisting changes silently truncated the template's roster +
 * dropped fields belonging to the removed signer.
 *
 * Rules:
 *
 *   - When `draftSignerCount >= sourceLastSigners.length` the user
 *     intentionally KEPT or GREW the roster — return the derived
 *     layout verbatim (the new positions and signer assignments are
 *     authoritative, and `last_signers` should reflect the current
 *     roster).
 *
 *   - When `draftSignerCount <  sourceLastSigners.length` the user
 *     reduced the roster for *this* envelope, not for the template
 *     definition. Preserve the original `last_signers` and re-attach
 *     the `field_layout` entries owned by the now-out-of-range signer
 *     ordinals so the saved template doesn't degrade.
 *
 * Inputs are treated as immutable; the returned arrays are fresh.
 */
export interface MergeOnReducedRosterInput {
  readonly derivedLayout: ReadonlyArray<TemplateField>;
  readonly draftLastSigners: ReadonlyArray<TemplateLastSigner>;
  readonly sourceFields: ReadonlyArray<TemplateField>;
  readonly sourceLastSigners: ReadonlyArray<TemplateLastSigner>;
}

export interface MergeOnReducedRosterResult {
  readonly fieldLayout: ReadonlyArray<TemplateField>;
  readonly lastSigners: ReadonlyArray<TemplateLastSigner>;
}

export function mergeFieldLayoutOnReducedRoster(
  input: MergeOnReducedRosterInput,
): MergeOnReducedRosterResult {
  const { derivedLayout, draftLastSigners, sourceFields, sourceLastSigners } = input;
  if (draftLastSigners.length >= sourceLastSigners.length) {
    return { fieldLayout: derivedLayout, lastSigners: draftLastSigners };
  }
  const preservedFromSource = sourceFields.filter(
    (f) => f.signerIndex !== undefined && f.signerIndex >= draftLastSigners.length,
  );
  return {
    fieldLayout: [...derivedLayout, ...preservedFromSource],
    lastSigners: sourceLastSigners,
  };
}
