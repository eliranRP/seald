import { describe, it, expect } from 'vitest';
import { rebindFieldsToSigners } from './rebindFieldsToSigners';
import type { ResolvedField } from './templates';

// Minimal helper — keeps the assertions focused on the signer-count rules.
function field(
  partial: Partial<ResolvedField> & Pick<ResolvedField, 'page' | 'type'>,
): ResolvedField {
  return {
    id: partial.id ?? `tpl-${partial.page}`,
    x: partial.x ?? 100,
    y: partial.y ?? 200,
    ...(partial.signerIndex !== undefined ? { signerIndex: partial.signerIndex } : {}),
    ...partial,
  };
}

describe('rebindFieldsToSigners', () => {
  it('returns an empty list when there are no resolved fields', () => {
    expect(rebindFieldsToSigners([], [{ id: 's1' }])).toEqual([]);
  });

  it('binds each field to signers[signerIndex] when index is in range', () => {
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'signature', signerIndex: 0 }),
      field({ id: 'b', page: 2, type: 'signature', signerIndex: 1 }),
    ];
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }, { id: 's2' }]);
    expect(out.map((f) => f.signerIds)).toEqual([['s1'], ['s2']]);
  });

  // Bug 2 spec, case (a): same number of signers — positions are
  // preserved by ordinal even when identities change. A template
  // saved with [alice, bob] is reused with [carol, dave]; carol gets
  // alice's fields, dave gets bob's fields.
  it('preserves field-to-ordinal binding even when signer identities are replaced', () => {
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'signature', signerIndex: 0 }),
      field({ id: 'b', page: 1, type: 'signature', signerIndex: 1 }),
    ];
    const out = rebindFieldsToSigners(resolved, [{ id: 'carol' }, { id: 'dave' }]);
    expect(out.map((f) => f.signerIds)).toEqual([['carol'], ['dave']]);
  });

  // Bug 2 spec, case (b): fewer signers than the template originally
  // had — the fields belonging to the removed signer must be DROPPED,
  // not silently re-bound to signers[0] (the original "duplicate
  // signatures for the remaining signer" symptom).
  it('drops fields whose signerIndex >= signers.length (signer removed)', () => {
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'signature', signerIndex: 0 }),
      field({ id: 'b', page: 1, type: 'signature', signerIndex: 1 }),
      field({ id: 'c', page: 2, type: 'signature', signerIndex: 1 }),
    ];
    // Only one signer in the new roster → only the index-0 field
    // survives. Two index-1 fields are dropped — NOT remapped to s1.
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', signerIds: ['s1'] });
  });

  // Bug 2 spec, case (c): more signers than the template originally
  // had — the saved fields stay bound to their original ordinals; the
  // additional signer naturally gets no preset fields (the user adds
  // them manually). Asserts no field is dropped just because extra
  // signers exist past the saved indexes.
  it('keeps every saved field when the new roster is larger; extra signers get no fields', () => {
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'signature', signerIndex: 0 }),
      field({ id: 'b', page: 2, type: 'signature', signerIndex: 1 }),
    ];
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    expect(out).toHaveLength(2);
    expect(out.map((f) => f.signerIds)).toEqual([['s1'], ['s2']]);
    // No s3-bound fields produced — the rebinder only emits what the
    // template stored. The user adds extra fields in the editor.
    expect(out.flatMap((f) => f.signerIds)).not.toContain('s3');
  });

  // Back-compat path: legacy templates that predate signerIndex
  // saving. We can't reconstruct who owned the field, so we fall back
  // to signers[0] (best-effort) and let the user re-assign.
  it('falls back to signers[0] when signerIndex is undefined (legacy)', () => {
    const resolved: ReadonlyArray<ResolvedField> = [field({ id: 'a', page: 1, type: 'signature' })];
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }, { id: 's2' }]);
    expect(out[0]?.signerIds).toEqual(['s1']);
  });

  it('emits an unassigned field when signerIndex is undefined and the roster is empty', () => {
    const resolved: ReadonlyArray<ResolvedField> = [field({ id: 'a', page: 1, type: 'signature' })];
    const out = rebindFieldsToSigners(resolved, []);
    expect(out).toHaveLength(1);
    expect(out[0]?.signerIds).toEqual([]);
  });

  it('preserves linkId from ResolvedField onto PlacedFieldValue', () => {
    // Without this, the editor's `useLinkedRemove` can't see that two
    // copies expanded from `pageRule: 'all'` belong together — the
    // confirmation dialog would never fire.
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'signature', signerIndex: 0, linkId: 'L-1' }),
      field({ id: 'b', page: 2, type: 'signature', signerIndex: 0, linkId: 'L-1' }),
    ];
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }]);
    expect(out.map((f) => f.linkId)).toEqual(['L-1', 'L-1']);
  });

  it('maps template field types to their editor counterparts', () => {
    const resolved: ReadonlyArray<ResolvedField> = [
      field({ id: 'a', page: 1, type: 'initial', signerIndex: 0 }),
      field({ id: 'b', page: 1, type: 'signature', signerIndex: 0 }),
      field({ id: 'c', page: 1, type: 'date', signerIndex: 0 }),
      field({ id: 'd', page: 1, type: 'text', signerIndex: 0 }),
      field({ id: 'e', page: 1, type: 'checkbox', signerIndex: 0 }),
    ];
    const out = rebindFieldsToSigners(resolved, [{ id: 's1' }]);
    expect(out.map((f) => f.type)).toEqual(['initials', 'signature', 'date', 'text', 'checkbox']);
  });
});
