import { describe, it, expect } from 'vitest';
import { deriveTemplateFieldLayout, inferPageRule } from './deriveFieldLayout';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

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
    expect(out).toEqual([{ type: 'text', pageRule: 3, x: 110, y: 220 }]);
  });

  it("collapses a fully-linked group across all pages to 'all'", () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
      field({ id: 'f2', page: 2, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
      field({ id: 'f3', page: 3, type: 'signature', x: 50, y: 100, linkId: 'L1' }),
    ];
    expect(deriveTemplateFieldLayout(fields, 3)).toEqual([
      { type: 'signature', pageRule: 'all', x: 50, y: 100, label: 'L1' },
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
      { type: 'initial', pageRule: 'allButLast', x: 80, y: 600, label: 'L2' },
    ]);
  });

  it('fans out a non-contiguous linked group as per-page numeric entries', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'date', x: 200, y: 50, linkId: 'L3' }),
      field({ id: 'f3', page: 3, type: 'date', x: 200, y: 50, linkId: 'L3' }),
    ];
    expect(deriveTemplateFieldLayout(fields, 5)).toEqual([
      { type: 'date', pageRule: 1, x: 200, y: 50, label: 'L3' },
      { type: 'date', pageRule: 3, x: 200, y: 50, label: 'L3' },
    ]);
  });

  it('skips field kinds that templates do not support yet (e.g. email)', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'email', x: 0, y: 0 }),
      field({ id: 'f2', page: 1, type: 'text', x: 10, y: 10 }),
    ];
    const out = deriveTemplateFieldLayout(fields, 1);
    // Only the text survives — email isn't in TEMPLATE_FIELD_TYPES.
    expect(out).toEqual([{ type: 'text', pageRule: 'last', x: 10, y: 10 }]);
  });

  it('uses the source field position when a linked group has shared (x,y)', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      field({ id: 'f1', page: 1, type: 'signature', x: 42, y: 84, linkId: 'L4' }),
      field({ id: 'f2', page: 2, type: 'signature', x: 42, y: 84, linkId: 'L4' }),
    ];
    const out = deriveTemplateFieldLayout(fields, 2);
    expect(out[0]).toMatchObject({ x: 42, y: 84 });
  });
});
