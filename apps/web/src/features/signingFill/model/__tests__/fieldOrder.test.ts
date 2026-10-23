import { describe, expect, it } from 'vitest';
import type { SignMeField } from '@/features/signing';
import { displayDate, isAutoField, nextTodoField, orderFields, todayIso } from '../fieldOrder';

function field(partial: Partial<SignMeField> & Pick<SignMeField, 'id' | 'kind'>): SignMeField {
  return {
    signer_id: 's',
    page: 1,
    x: 10,
    y: 10,
    required: true,
    ...partial,
  } as SignMeField;
}

describe('isAutoField', () => {
  it('is true for the date, the name and a text field linked as name', () => {
    expect(isAutoField(field({ id: 'a', kind: 'date' }))).toBe(true);
    expect(isAutoField(field({ id: 'b', kind: 'name' }))).toBe(true);
    expect(isAutoField(field({ id: 'c', kind: 'text', link_id: 'name' }))).toBe(true);
  });
  it('is false for what the signer fills by hand', () => {
    for (const kind of ['signature', 'initials', 'text', 'checkbox', 'email'] as const) {
      expect(isAutoField(field({ id: 'x', kind }))).toBe(false);
    }
  });
});

describe('orderFields', () => {
  it('reads document by document, page by page, top to bottom, left to right', () => {
    const fields = [
      field({ id: 'b2', kind: 'text', document_id: 'B', page: 1 }),
      field({ id: 'a2', kind: 'text', document_id: 'A', page: 2, y: 5 }),
      field({ id: 'a1r', kind: 'text', document_id: 'A', page: 1, x: 90, y: 5 }),
      field({ id: 'a1l', kind: 'text', document_id: 'A', page: 1, x: 10, y: 5 }),
    ];
    const docs = [
      { id: 'A', ord: 1, title: 'A', original_pages: 2 },
      { id: 'B', ord: 2, title: 'B', original_pages: 1 },
    ];
    expect(orderFields(fields, docs).map((f) => f.id)).toEqual(['a1l', 'a1r', 'a2', 'b2']);
  });
});

describe('nextTodoField', () => {
  it('returns the first required empty field, by hand before auto', () => {
    const fields = [
      field({ id: 'name', kind: 'name', y: 5 }),
      field({ id: 'sig', kind: 'signature', y: 50 }),
      field({ id: 'opt', kind: 'text', y: 1, required: false }),
    ];
    expect(nextTodoField(fields)?.id).toBe('sig');
  });

  it('falls back to an auto field when nothing else is left, and to null when all is done', () => {
    const fields = [
      field({ id: 'name', kind: 'name' }),
      field({ id: 'sig', kind: 'signature', value_text: 'x' }),
    ];
    expect(nextTodoField(fields)?.id).toBe('name');
    expect(nextTodoField(fields, [], 'name')).toBeNull();
  });

  it('counts a ticked checkbox as done', () => {
    const fields = [field({ id: 'c', kind: 'checkbox', value_boolean: true })];
    expect(nextTodoField(fields)).toBeNull();
  });
});

describe('dates', () => {
  it('writes today as yyyy-MM-dd in local time', () => {
    expect(todayIso(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
  });
  it('shows an ISO date as "Oct 23, 2026" and leaves other text alone', () => {
    expect(displayDate('2026-10-23')).toBe('Oct 23, 2026');
    expect(displayDate('23/10/2026')).toBe('23/10/2026');
    expect(displayDate('2026-13-40')).toBe('2026-13-40');
  });
});
