import { describe, expect, it } from 'vitest';
import {
  applyPagesToSelection,
  assignSignersToSelection,
  buildDroppedField,
  commitDrag,
  deleteFields,
  fieldsOnPage,
  nextStep,
  pagesWithFields,
  previousStep,
  toggleSelection,
} from './model';
import type { MobilePlacedField, MobileStep } from './types';

const BOUNDS = { width: 360, height: 340 } as const;

function field(over: Partial<MobilePlacedField>): MobilePlacedField {
  return {
    id: 'f1',
    type: 'sig',
    page: 1,
    x: 30,
    y: 40,
    signerIds: ['s1'],
    linkedPages: [1],
    ...over,
  };
}

describe('mobile send · model', () => {
  describe('buildDroppedField', () => {
    it('centers the field at the tap, offset by w/2 and h/2', () => {
      const f = buildDroppedField({
        type: 'sig',
        page: 2,
        position: { x: 100, y: 80 },
        firstSignerId: 's1',
      });
      // signature def is 180×50 → 100-90=10 → max(8,10)=10, 80-25=55
      expect(f).toMatchObject({
        type: 'sig',
        page: 2,
        x: 10,
        y: 55,
        signerIds: ['s1'],
        linkedPages: [2],
      });
    });

    it('clamps to a minimum of 8px from the top-left edge', () => {
      const f = buildDroppedField({
        type: 'chk',
        page: 1,
        position: { x: 0, y: 0 },
        firstSignerId: 's1',
      });
      expect(f.x).toBe(8);
      expect(f.y).toBe(8);
    });

    it('produces an empty signerIds array when there are no signers yet', () => {
      const f = buildDroppedField({
        type: 'sig',
        page: 1,
        position: { x: 100, y: 80 },
        firstSignerId: undefined,
      });
      expect(f.signerIds).toEqual([]);
    });
  });

  describe('toggleSelection', () => {
    it('adds an id when missing', () => {
      expect(toggleSelection(['a'], 'b', false)).toEqual(['a', 'b']);
    });
    it('removes an id when present', () => {
      expect(toggleSelection(['a', 'b'], 'a', false)).toEqual(['b']);
    });
    it('replaces the selection when replace=true', () => {
      expect(toggleSelection(['a', 'b'], 'c', true)).toEqual(['c']);
    });
  });

  describe('commitDrag', () => {
    it('translates only the named fields and clamps to the canvas', () => {
      const fields = [field({ id: 'a', x: 30, y: 40 }), field({ id: 'b', x: 50, y: 60 })];
      const out = commitDrag({ fields, ids: ['a'], dx: 1000, dy: 1000, bounds: BOUNDS });
      // a should be clamped to maxX = 360 - 180 - 8 = 172
      expect(out[0]?.x).toBe(172);
      expect(out[0]?.y).toBe(BOUNDS.height - 50 - 8);
      // b untouched
      expect(out[1]?.x).toBe(50);
    });

    it('refuses to translate below 8px', () => {
      const fields = [field({ id: 'a', x: 30, y: 40 })];
      const out = commitDrag({ fields, ids: ['a'], dx: -9999, dy: -9999, bounds: BOUNDS });
      expect(out[0]?.x).toBe(8);
      expect(out[0]?.y).toBe(8);
    });
  });

  describe('applyPagesToSelection', () => {
    it('applies the chosen mode to every selected field', () => {
      const fields = [field({ id: 'a', linkedPages: [1] }), field({ id: 'b', linkedPages: [1] })];
      const out = applyPagesToSelection({
        fields,
        selectedIds: ['a'],
        mode: 'all',
        currentPage: 1,
        totalPages: 5,
        customPages: [],
      });
      expect(out[0]?.linkedPages).toEqual([1, 2, 3, 4, 5]);
      expect(out[1]?.linkedPages).toEqual([1]);
    });

    it('honors a custom page list', () => {
      const fields = [field({ id: 'a' })];
      const out = applyPagesToSelection({
        fields,
        selectedIds: ['a'],
        mode: 'custom',
        currentPage: 1,
        totalPages: 12,
        customPages: [2, 4, 6],
      });
      expect(out[0]?.linkedPages).toEqual([2, 4, 6]);
    });
  });

  describe('assignSignersToSelection', () => {
    it('reassigns in place when only one signer is chosen', () => {
      const fields = [field({ id: 'a', signerIds: ['s1'] })];
      const result = assignSignersToSelection({
        fields,
        selectedIds: ['a'],
        signerIds: ['s2'],
        bounds: BOUNDS,
      });
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]?.signerIds).toEqual(['s2']);
      expect(result.nextSelection).toEqual(['a']);
    });

    it('splits the source field into N when multiple signers are chosen', () => {
      const fields = [field({ id: 'a', x: 30, signerIds: ['s1'] })];
      const result = assignSignersToSelection({
        fields,
        selectedIds: ['a'],
        signerIds: ['s1', 's2', 's3'],
        bounds: BOUNDS,
      });
      expect(result.fields).toHaveLength(3);
      // Each clone is single-signer
      expect(result.fields.map((f) => f.signerIds)).toEqual([['s1'], ['s2'], ['s3']]);
      // Bounds width 360, sig width 180 + 8 stride = 188, maxX = 172.
      // Three 180-wide fields physically can't all fit, so the row pulls
      // back to startX=0 and the trailing two clamp to maxX=172.
      expect(result.fields[0]?.x).toBe(0);
      expect(result.fields[1]?.x).toBe(172);
      expect(result.fields[2]?.x).toBe(172);
      // Selection now points at the new ids
      expect(result.nextSelection).toEqual(result.fields.map((f) => f.id));
    });

    it('pulls the row back so a 2-signer split at the canvas right edge stays side-by-side (no stack)', () => {
      // QA-4 (PR #108): dropping near the right edge then splitting for
      // 2 signers would clamp both fields to maxX, stacking them on top
      // of each other. Verify the new clamp pulls startX back so both
      // fit, separated by a stride.
      const fields = [field({ id: 'a', x: 320, signerIds: ['s1'] })];
      const result = assignSignersToSelection({
        fields,
        selectedIds: ['a'],
        signerIds: ['s1', 's2'],
        bounds: BOUNDS, // width 360
      });
      expect(result.fields).toHaveLength(2);
      // stride = 180+8 = 188, maxX = 172, rowSpan = 188, startX = max(0, min(320, 172-188)) = 0
      expect(result.fields[0]?.x).toBe(0);
      expect(result.fields[1]?.x).toBe(172);
      // Confirm the two fields don't overlap horizontally.
      const field0Right = (result.fields[0]?.x ?? 0) + 180;
      const field1Left = result.fields[1]?.x ?? 0;
      expect(field1Left).toBeGreaterThanOrEqual(field0Right - 8);
    });

    it('clears the source from the field list (no original remains)', () => {
      const fields = [field({ id: 'a' }), field({ id: 'b' })];
      const result = assignSignersToSelection({
        fields,
        selectedIds: ['a'],
        signerIds: ['s1', 's2'],
        bounds: BOUNDS,
      });
      // 'a' replaced by 2 new fields; 'b' untouched → 3 total
      expect(result.fields).toHaveLength(3);
      expect(result.fields.find((f) => f.id === 'a')).toBeUndefined();
      expect(result.fields.find((f) => f.id === 'b')).toBeDefined();
    });

    it('returns the input untouched when nothing is selected', () => {
      const fields = [field({ id: 'a' })];
      const result = assignSignersToSelection({
        fields,
        selectedIds: [],
        signerIds: ['s1', 's2'],
        bounds: BOUNDS,
      });
      expect(result.fields).toBe(fields);
      expect(result.nextSelection).toEqual([]);
    });
  });

  describe('deleteFields / fieldsOnPage / pagesWithFields', () => {
    const fields: ReadonlyArray<MobilePlacedField> = [
      field({ id: 'a', linkedPages: [1, 3] }),
      field({ id: 'b', linkedPages: [2] }),
      field({ id: 'c', linkedPages: [3] }),
    ];

    it('deleteFields removes ids', () => {
      expect(deleteFields(fields, ['a', 'c']).map((f) => f.id)).toEqual(['b']);
    });

    it('fieldsOnPage returns linked + page-local matches', () => {
      expect(fieldsOnPage(fields, 1).map((f) => f.id)).toEqual(['a']);
      expect(fieldsOnPage(fields, 3).map((f) => f.id)).toEqual(['a', 'c']);
    });

    it('pagesWithFields aggregates linked pages', () => {
      const set = pagesWithFields(fields);
      expect(set.has(1)).toBe(true);
      expect(set.has(2)).toBe(true);
      expect(set.has(3)).toBe(true);
      expect(set.has(4)).toBe(false);
    });
  });

  describe('step transitions', () => {
    it('walks forward through every step', () => {
      let cur: MobileStep = 'start';
      const seen: MobileStep[] = [cur];
      for (let i = 0; i < 6; i += 1) {
        cur = nextStep(cur);
        seen.push(cur);
      }
      expect(seen).toEqual(['start', 'file', 'signers', 'place', 'review', 'sent', 'sent']);
    });

    it('walks back through every step and stops at start', () => {
      let cur: MobileStep = 'sent';
      const seen: MobileStep[] = [cur];
      for (let i = 0; i < 6; i += 1) {
        cur = previousStep(cur);
        seen.push(cur);
      }
      expect(seen).toEqual(['sent', 'review', 'place', 'signers', 'file', 'start', 'start']);
    });
  });
});
