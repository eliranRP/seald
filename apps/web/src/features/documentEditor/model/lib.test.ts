import { describe, expect, it } from 'vitest';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import {
  expandSelectionToGroup,
  hasAnyGrouped,
  isFullyGrouped,
  makeGroupId,
  withoutGroupId,
} from './lib';

const f = (overrides: Partial<PlacedFieldValue> & { readonly id: string }): PlacedFieldValue => ({
  page: 1,
  type: 'signature',
  x: 0,
  y: 0,
  signerIds: ['a'],
  ...overrides,
});

describe('makeGroupId', () => {
  it('returns a string with the `g_` prefix so logs are easy to scan', () => {
    expect(makeGroupId()).toMatch(/^g_[a-z0-9]+_[a-z0-9]+$/i);
  });

  it('produces distinct ids on consecutive calls', () => {
    const a = makeGroupId();
    const b = makeGroupId();
    expect(a).not.toEqual(b);
  });
});

describe('withoutGroupId', () => {
  it('returns the field as-is when no groupId is present (cheap path)', () => {
    const field = f({ id: '1' });
    expect(withoutGroupId(field)).toBe(field);
  });

  it('returns a new object with `groupId` removed (not just set to undefined)', () => {
    const field = f({ id: '1', groupId: 'g_1' });
    const next = withoutGroupId(field);
    expect(next).not.toBe(field);
    expect('groupId' in next).toBe(false);
  });

  it('preserves all other fields verbatim', () => {
    const field = f({
      id: '1',
      page: 3,
      type: 'date',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      signerIds: ['a', 'b'],
      required: false,
      linkId: 'l_1',
      groupId: 'g_1',
    });
    expect(withoutGroupId(field)).toMatchObject({
      id: '1',
      page: 3,
      type: 'date',
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      signerIds: ['a', 'b'],
      required: false,
      linkId: 'l_1',
    });
  });
});

describe('expandSelectionToGroup', () => {
  it('returns the input unchanged when no selected field has a groupId', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1' }),
      f({ id: '2' }),
      f({ id: '3' }),
    ];
    expect(expandSelectionToGroup(['1', '2'], fields)).toEqual(['1', '2']);
  });

  it('adds every member of the selected group, even if not initially selected', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2', groupId: 'g_a' }),
      f({ id: '3' }),
      f({ id: '4', groupId: 'g_a' }),
    ];
    const out = expandSelectionToGroup(['1'], fields);
    expect(new Set(out)).toEqual(new Set(['1', '2', '4']));
  });

  it('expands every represented group when multiple groups are present', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2', groupId: 'g_a' }),
      f({ id: '3', groupId: 'g_b' }),
      f({ id: '4', groupId: 'g_b' }),
      f({ id: '5' }),
    ];
    const out = expandSelectionToGroup(['1', '3'], fields);
    expect(new Set(out)).toEqual(new Set(['1', '2', '3', '4']));
  });

  it('is idempotent — re-expanding an already-full group does not duplicate ids', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2', groupId: 'g_a' }),
    ];
    const once = expandSelectionToGroup(['1'], fields);
    const twice = expandSelectionToGroup(once, fields);
    expect(twice).toHaveLength(2);
    expect(new Set(twice)).toEqual(new Set(['1', '2']));
  });

  it('returns an empty selection unchanged', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [f({ id: '1', groupId: 'g_a' })];
    expect(expandSelectionToGroup([], fields)).toEqual([]);
  });
});

describe('isFullyGrouped', () => {
  it('is false for selections of fewer than two fields', () => {
    expect(isFullyGrouped([], [])).toBe(false);
    expect(isFullyGrouped(['1'], [f({ id: '1', groupId: 'g_a' })])).toBe(false);
  });

  it('is true when every selected field shares the same groupId', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2', groupId: 'g_a' }),
      f({ id: '3', groupId: 'g_a' }),
    ];
    expect(isFullyGrouped(['1', '2', '3'], fields)).toBe(true);
  });

  it('is false when one selected field is ungrouped', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2' }),
    ];
    expect(isFullyGrouped(['1', '2'], fields)).toBe(false);
  });

  it('is false when selected fields belong to different groups', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2', groupId: 'g_b' }),
    ];
    expect(isFullyGrouped(['1', '2'], fields)).toBe(false);
  });
});

describe('hasAnyGrouped', () => {
  it('is false on empty selection', () => {
    expect(hasAnyGrouped([], [])).toBe(false);
  });

  it('is false when no selected field has a groupId', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [f({ id: '1' }), f({ id: '2' })];
    expect(hasAnyGrouped(['1', '2'], fields)).toBe(false);
  });

  it('is true when at least one selected field is in a group', () => {
    const fields: ReadonlyArray<PlacedFieldValue> = [
      f({ id: '1', groupId: 'g_a' }),
      f({ id: '2' }),
    ];
    expect(hasAnyGrouped(['1', '2'], fields)).toBe(true);
  });
});
