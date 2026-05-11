import { describe, expect, it } from 'vitest';
import { parseSort, DEFAULT_SORT } from './sortEnvelopes';

describe('parseSort', () => {
  it('returns the default (date desc) when there is no sort param', () => {
    expect(parseSort(new URLSearchParams())).toEqual(DEFAULT_SORT);
    expect(DEFAULT_SORT).toEqual({ key: 'date', dir: 'desc' });
  });

  it('parses a valid sort key and direction', () => {
    expect(parseSort(new URLSearchParams('sort=title&dir=asc'))).toEqual({
      key: 'title',
      dir: 'asc',
    });
  });

  it('accepts every supported sort key', () => {
    for (const key of ['title', 'signers', 'progress', 'status', 'date'] as const) {
      expect(parseSort(new URLSearchParams(`sort=${key}&dir=desc`)).key).toBe(key);
    }
  });

  it('falls back to the default key when the sort param is bogus', () => {
    expect(parseSort(new URLSearchParams('sort=bogus&dir=asc'))).toEqual({
      key: 'date',
      dir: 'asc',
    });
  });

  it('falls back to the default direction when dir is bogus', () => {
    expect(parseSort(new URLSearchParams('sort=status&dir=sideways'))).toEqual({
      key: 'status',
      dir: 'desc',
    });
  });
});
