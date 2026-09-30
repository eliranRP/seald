import { describe, it, expect } from 'vitest';
import { toTemplateCoordV2, type TemplateFieldType } from 'shared';
import { deriveTemplateFieldLayout, inferPageRule } from '../deriveFieldLayout';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

function v2(type: TemplateFieldType, x: number, y: number) {
  return toTemplateCoordV2({ type, x, y });
}

// `inferPageRule` is the heart of the round-trip — every named pageRule
// (`'all'`, `'allButLast'`, `'first'`, `'last'`) routes through it. We
// test it in isolation so the rule semantics stay honest even if the
// outer `deriveTemplateFieldLayout` grows new logic later.
describe('inferPageRule', () => {
  it('returns null for an empty page set', () => {
    expect(inferPageRule([], 5)).toBeNull();
  });

  it("treats a single first page as 'first'", () => {
    expect(inferPageRule([1], 5)).toBe('first');
  });

  it("treats a single last page as 'last'", () => {
    expect(inferPageRule([5], 5)).toBe('last');
  });

  it("treats a single page that is also the only page as 'last' (last-wins)", () => {
    // On a 1-page document, page 1 is BOTH first and last; the canonical
    // pick is `'last'` (last-wins) because it carries the more useful
    // semantics when the layout re-projects onto a longer doc — the
    // signature stays anchored to the final page, not the cover.
    expect(inferPageRule([1], 1)).toBe('last');
  });

  it('returns the numeric page for a single non-edge page', () => {
    expect(inferPageRule([3], 5)).toBe(3);
  });

  it("collapses a contiguous {1..N} cover to 'all'", () => {
    expect(inferPageRule([1, 2, 3, 4, 5], 5)).toBe('all');
  });

  it("collapses a contiguous {1..N-1} cover to 'allButLast'", () => {
    expect(inferPageRule([1, 2, 3, 4], 5)).toBe('allButLast');
  });

  it('returns null for non-contiguous multi-page coverage', () => {
    // {1, 3} on 5 pages doesn't match any rule — caller fans out to
    // per-page numeric entries.
    expect(inferPageRule([1, 3], 5)).toBeNull();
  });

  it("requires a 2+ page document for 'allButLast'", () => {
    // On a single-page doc, {1} is `'last'` (covered above), never
    // `'allButLast'` (which would mean zero pages).
    expect(inferPageRule([1], 1)).not.toBe('allButLast');
  });
});

// Helpers — keep field construction terse so the assertions read like
// the actual rule names and not boilerplate.
function field(
  partial: Partial<PlacedFieldValue> & Pick<PlacedFieldValue, 'page' | 'type'>,
): PlacedFieldValue {
  return {
    id: partial.id ?? `f-${partial.page}-${Math.random().toString(16).slice(2, 6)}`,
    x: partial.x ?? 100,
    y: partial.y ?? 200,
    signerIds: partial.signerIds ?? [],
    ...partial,
  };
}

describe('deriveTemplateFieldLayout', () => {
  it('returns an empty array when no fields are placed', () => {
    expect(deriveTemplateFieldLayout([], 5)).toEqual([]);
  });

  it('emits a numeric pageRule for a standalone field on a body page', () => {
    const out = deriveTemplateFieldLayout(
      [field({ id: 'f1', page: 3, type: 'text', x: 110, y: 220 })],
      5,
    );
    expect(out).toEqual([{ type: 'text', pageRule: 3, ...v2('text', 110, 220) }]);
  });

  it("collapses a fully-linked group across all pages to 'all'", () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
      field({ id: 'f2', page: 2, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
      field({ id: 'f3', page: 3, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
    ];
    expect(deriveTemplateFieldLayout(fields, 3)).toEqual([
      { type: 'signature', pageRule: 'all', ...v2('signature', 50, 100), label: 'L1' },
    ]);
  });

  it("collapses a {1..N-1} linked group to 'allButLast'", () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'initials', x: 80, y: 600, linkId: 'L2' }),
      field({ id: 'f2', page: 2, type: 'initials', x: 80, y: 600, linkId: 'L2' }),
      field({ id: 'f3', page: 3, type: 'initials', x: 80, y: 600, linkId: 'L2' }),
    ];
    expect(deriveTemplateFieldLayout(fields, 4)).toEqual([
      // 'initials' (editor) → 'initial' (template) — singular vs plural.
      { type: 'initial', pageRule: 'allButLast', ...v2('initial', 80, 600), label: 'L2' },
    ]);
  });

  it('fans out a non-contiguous linked group as per-page numeric entries', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'date', x: 200, y: 50, linkId: 'L3' }),
      field({ id: 'f3', page: 3, type: 'date', x: 200, y: 50, linkId: 'L3' }),
    ];
    expect(deriveTemplateFieldLayout(fields, 5)).toEqual([
      { type: 'date', pageRule: 1, ...v2('date', 200, 50), label: 'L3' },
      { type: 'date', pageRule: 3, ...v2('date', 200, 50), label: 'L3' },
    ]);
  });

  it('saves an email field instead of dropping it', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'email', x: 0, y: 0 }),
      field({ id: 'f2', page: 1, type: 'text', x: 10, y: 10 }),
    ];
    const out = deriveTemplateFieldLayout(fields, 1);
    expect(out).toEqual([
      { type: 'email', pageRule: 'last', ...v2('email', 0, 0) },
      { type: 'text', pageRule: 'last', ...v2('text', 10, 10) },
    ]);
  });

  it('normalizes y against the supplied page aspect', () => {
    const out = deriveTemplateFieldLayout(
      [field({ id: 'f1', page: 1, type: 'signature', x: 280, y: 140 })],
      1,
      undefined,
      [{ page: 1, width: 200, height: 100 }],
    );
    expect(out[0]).toMatchObject({ coordVersion: 2, x: 280 / 560, y: 140 / 280 });
  });

  it('uses the source field position when a linked group has shared (x,y)', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'signature', x: 42, y: 84, linkId: 'L4' }),
      field({ id: 'f2', page: 2, type: 'signature', x: 42, y: 84, linkId: 'L4' }),
    ];
    const out = deriveTemplateFieldLayout(fields, 2);
    expect(out[0]).toMatchObject(v2('signature', 42, 84));
  });

  // signerIndex round-trip — required to fix the bug where every reused
  // template's fields collapsed onto signers[0]. Each saved entry must
  // record the 0-based ordinal of its owning signer in the supplied
  // roster, and only when a roster is passed (back-compat with older
  // saves and the "save without sending" path that didn't have one).
  it('omits signerIndex when no signers roster is supplied', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'text', x: 10, y: 10, signerIds: ['s1'] }),
    ];
    const out = deriveTemplateFieldLayout(fields, 1);
    expect(out).toEqual([{ type: 'text', pageRule: 'last', ...v2('text', 10, 10) }]);
    expect(out[0]).not.toHaveProperty('signerIndex');
  });

  it("records each field's signerIndex as the 0-based ordinal in the roster", () => {
    // 4-page doc to keep page 1 a numeric rule (`'first'` only kicks in
    // on the literal first page; `'last'` only on the literal last
    // page — see the inferPageRule cases above). We want the rule
    // assertions to be about coordinates, not edge collapsing.
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 2, type: 'signature', x: 50, y: 100, signerIds: ['s2'] }),
      field({ id: 'f2', page: 3, type: 'signature', x: 60, y: 110, signerIds: ['s1'] }),
    ];
    const out = deriveTemplateFieldLayout(fields, 4, [{ id: 's1' }, { id: 's2' }]);
    expect(out).toEqual([
      // signerRoleId is the canonical binding (drives stable rebind
      // when the wizard removes a mid-list signer); signerIndex is
      // kept alongside for legacy rebinder back-compat.
      {
        type: 'signature',
        pageRule: 2,
        ...v2('signature', 50, 100),
        signerIndex: 1,
        signerRoleId: 's2',
      },
      {
        type: 'signature',
        pageRule: 3,
        ...v2('signature', 60, 110),
        signerIndex: 0,
        signerRoleId: 's1',
      },
    ]);
  });

  it('propagates signerIndex + signerRoleId onto every fan-out entry of a non-contiguous group', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'date', x: 200, y: 50, linkId: 'L3', signerIds: ['s2'] }),
      field({ id: 'f3', page: 3, type: 'date', x: 200, y: 50, linkId: 'L3', signerIds: ['s2'] }),
    ];
    const out = deriveTemplateFieldLayout(fields, 5, [{ id: 's1' }, { id: 's2' }]);
    expect(out).toEqual([
      {
        type: 'date',
        pageRule: 1,
        ...v2('date', 200, 50),
        label: 'L3',
        signerIndex: 1,
        signerRoleId: 's2',
      },
      {
        type: 'date',
        pageRule: 3,
        ...v2('date', 200, 50),
        label: 'L3',
        signerIndex: 1,
        signerRoleId: 's2',
      },
    ]);
  });

  it('omits signerIndex when the field has no signer or the signer is missing from the roster', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'text', x: 10, y: 10, signerIds: [] }),
      field({ id: 'f2', page: 1, type: 'text', x: 20, y: 20, signerIds: ['ghost'] }),
    ];
    const out = deriveTemplateFieldLayout(fields, 1, [{ id: 's1' }]);
    expect(out).toEqual([
      { type: 'text', pageRule: 'last', ...v2('text', 10, 10) },
      { type: 'text', pageRule: 'last', ...v2('text', 20, 20) },
    ]);
  });
});
