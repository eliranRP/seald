import { describe, expect, it } from 'vitest';
import type { TemplateField, TemplateLastSigner } from 'shared';
import { mergeFieldLayoutOnReducedRoster } from './mergeFieldLayoutOnReducedRoster';

function field(partial: Partial<TemplateField> & Pick<TemplateField, 'type'>): TemplateField {
  return {
    pageRule: partial.pageRule ?? 1,
    x: partial.x ?? 100,
    y: partial.y ?? 200,
    ...partial,
  };
}

function signer(id: string): TemplateLastSigner {
  return { id, name: id, email: `${id}@seald.app`, color: '#818CF8' };
}

describe('mergeFieldLayoutOnReducedRoster', () => {
  it('returns the derived layout verbatim when the draft roster matches the source', () => {
    const derivedLayout = [field({ type: 'signature', signerIndex: 0 })];
    const draftLastSigners = [signer('alice')];
    const sourceLastSigners = [signer('alice')];
    const sourceFields = [field({ type: 'signature', signerIndex: 0, x: 10 })];

    const merged = mergeFieldLayoutOnReducedRoster({
      derivedLayout,
      draftLastSigners,
      sourceFields,
      sourceLastSigners,
    });

    expect(merged.fieldLayout).toEqual(derivedLayout);
    expect(merged.lastSigners).toEqual(draftLastSigners);
  });

  it('returns the derived layout verbatim when the draft roster grew (more signers added)', () => {
    const derivedLayout = [
      field({ type: 'signature', signerIndex: 0 }),
      field({ type: 'signature', signerIndex: 1 }),
    ];
    const draftLastSigners = [signer('alice'), signer('bob')];
    const sourceLastSigners = [signer('alice')];
    const sourceFields = [field({ type: 'signature', signerIndex: 0 })];

    const merged = mergeFieldLayoutOnReducedRoster({
      derivedLayout,
      draftLastSigners,
      sourceFields,
      sourceLastSigners,
    });

    expect(merged.fieldLayout).toEqual(derivedLayout);
    expect(merged.lastSigners).toEqual(draftLastSigners);
  });

  // The user-reported bug: template authored with 2 signers, reused
  // with 1, then "Send and update" pressed (intentionally OR by mistake).
  // Pre-fix: template was overwritten with last_signers=[s1] and the
  // signer-#1 field was lost. Post-fix: original last_signers is kept
  // and the signer-#1 field entry is re-attached.
  it('preserves the source roster + removed-signer fields when the draft roster shrank', () => {
    const derivedLayout = [field({ type: 'signature', signerIndex: 0, x: 50 })];
    const draftLastSigners = [signer('alice')];
    const sourceLastSigners = [signer('alice'), signer('bob')];
    const sourceFields = [
      field({ type: 'signature', signerIndex: 0, x: 10 }),
      field({ type: 'signature', signerIndex: 1, x: 999 }),
    ];

    const merged = mergeFieldLayoutOnReducedRoster({
      derivedLayout,
      draftLastSigners,
      sourceFields,
      sourceLastSigners,
    });

    // Roster preserved.
    expect(merged.lastSigners).toEqual(sourceLastSigners);
    // Layout = derived (alice's new positions) + signer-#1 field
    // restored from source so bob's slot doesn't get erased.
    expect(merged.fieldLayout).toHaveLength(2);
    expect(merged.fieldLayout[0]).toMatchObject({ signerIndex: 0, x: 50 });
    expect(merged.fieldLayout[1]).toMatchObject({ signerIndex: 1, x: 999 });
  });

  it('ignores source fields without signerIndex when reattaching (legacy back-compat path)', () => {
    const derivedLayout = [field({ type: 'signature', signerIndex: 0 })];
    const draftLastSigners = [signer('alice')];
    const sourceLastSigners = [signer('alice'), signer('bob')];
    const sourceFields = [
      field({ type: 'signature', signerIndex: 0 }),
      // Legacy entry — no signerIndex. Cannot be safely reattached
      // because we don't know which signer owned it.
      field({ type: 'date' }),
      field({ type: 'signature', signerIndex: 1 }),
    ];

    const merged = mergeFieldLayoutOnReducedRoster({
      derivedLayout,
      draftLastSigners,
      sourceFields,
      sourceLastSigners,
    });

    expect(merged.fieldLayout).toHaveLength(2);
    expect(merged.fieldLayout.every((f) => f.signerIndex !== undefined)).toBe(true);
  });

  it('handles an empty source roster (legacy template with no last_signers stored)', () => {
    const derivedLayout = [field({ type: 'signature', signerIndex: 0 })];
    const draftLastSigners = [signer('alice')];
    const merged = mergeFieldLayoutOnReducedRoster({
      derivedLayout,
      draftLastSigners,
      sourceFields: [],
      sourceLastSigners: [],
    });
    expect(merged.fieldLayout).toEqual(derivedLayout);
    expect(merged.lastSigners).toEqual(draftLastSigners);
  });
});
