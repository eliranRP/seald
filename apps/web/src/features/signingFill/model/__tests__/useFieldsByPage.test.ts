import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { SignMeField } from '@/features/signing';
import { useFieldsByPage } from '../useFieldsByPage';

function f(partial: Partial<SignMeField> & Pick<SignMeField, 'id' | 'page' | 'kind'>): SignMeField {
  return {
    signer_id: 'me',
    x: 0,
    y: 0,
    required: true,
    ...partial,
  } as SignMeField;
}

describe('useFieldsByPage', () => {
  it('returns empty map + empty counts for an empty fields array', () => {
    const { result } = renderHook(() => useFieldsByPage([]));
    expect(result.current.fieldsByPage.size).toBe(0);
    expect(result.current.fieldCountByPage).toEqual({});
  });

  it('groups fields by their page property and tallies counts in one pass', () => {
    const fields: SignMeField[] = [
      f({ id: 'a', page: 1, kind: 'text' }),
      f({ id: 'b', page: 1, kind: 'signature' }),
      f({ id: 'c', page: 3, kind: 'date' }),
      f({ id: 'd', page: 2, kind: 'checkbox' }),
      f({ id: 'e', page: 3, kind: 'text' }),
    ];
    const { result } = renderHook(() => useFieldsByPage(fields));
    const { fieldsByPage, fieldCountByPage } = result.current;
    expect(fieldsByPage.get(1)?.map((x) => x.id)).toEqual(['a', 'b']);
    expect(fieldsByPage.get(2)?.map((x) => x.id)).toEqual(['d']);
    expect(fieldsByPage.get(3)?.map((x) => x.id)).toEqual(['c', 'e']);
    expect(fieldCountByPage).toEqual({ 1: 2, 2: 1, 3: 2 });
  });

  it('memoizes the result while the same fields reference is reused', () => {
    const fields: SignMeField[] = [f({ id: 'a', page: 1, kind: 'text' })];
    const { result, rerender } = renderHook(
      ({ data }: { data: SignMeField[] }) => useFieldsByPage(data),
      { initialProps: { data: fields } },
    );
    const first = result.current.fieldsByPage;
    rerender({ data: fields });
    expect(result.current.fieldsByPage).toBe(first);
  });

  it('produces a new map when the fields array reference changes', () => {
    const a: SignMeField[] = [f({ id: 'a', page: 1, kind: 'text' })];
    const b: SignMeField[] = [...a, f({ id: 'b', page: 2, kind: 'date' })];
    const { result, rerender } = renderHook(
      ({ data }: { data: SignMeField[] }) => useFieldsByPage(data),
      { initialProps: { data: a } },
    );
    const first = result.current.fieldsByPage;
    rerender({ data: b });
    expect(result.current.fieldsByPage).not.toBe(first);
    expect(result.current.fieldsByPage.get(2)?.map((x) => x.id)).toEqual(['b']);
  });
});
