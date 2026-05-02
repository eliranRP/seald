import { describe, expect, it } from 'vitest';
import { getFieldDef, initialsFromName, parseCustomPages, resolveApplyPages } from './types';

describe('mobile send · types helpers', () => {
  it('looks up known field defs', () => {
    expect(getFieldDef('sig').label).toBe('Signature');
    expect(getFieldDef('chk').w).toBe(32);
  });

  it('throws on an unknown field type', () => {
    expect(() => getFieldDef('xx' as never)).toThrow(/unknown field type/i);
  });

  it('builds initials from full names', () => {
    expect(initialsFromName('Jamie Okonkwo')).toBe('JO');
    expect(initialsFromName('  Cher  ')).toBe('C');
    expect(initialsFromName('priya devi kapoor')).toBe('PK');
    expect(initialsFromName('')).toBe('?');
  });

  describe('parseCustomPages', () => {
    it('parses a clean comma list', () => {
      expect(parseCustomPages('1,3,5', 12, 1)).toEqual([1, 3, 5]);
    });

    it('trims whitespace', () => {
      expect(parseCustomPages(' 2 ,  4 ,6 ', 12, 1)).toEqual([2, 4, 6]);
    });

    it('dedupes repeated entries', () => {
      expect(parseCustomPages('1,1,2,3,3', 12, 1)).toEqual([1, 2, 3]);
    });

    it('drops entries outside the page range', () => {
      expect(parseCustomPages('0,5,99', 10, 1)).toEqual([5]);
    });

    it('drops non-integer tokens', () => {
      expect(parseCustomPages('1,foo,3', 12, 1)).toEqual([1, 3]);
    });

    it('falls back to the current page when nothing valid is given', () => {
      expect(parseCustomPages('', 12, 4)).toEqual([4]);
      expect(parseCustomPages('foo,bar', 12, 7)).toEqual([7]);
    });

    it('returns ascending order even when input is shuffled', () => {
      expect(parseCustomPages('5,2,8,1', 12, 1)).toEqual([1, 2, 5, 8]);
    });
  });

  describe('resolveApplyPages', () => {
    it('handles each canonical mode', () => {
      expect(resolveApplyPages('this', 12, 4, [])).toEqual([4]);
      expect(resolveApplyPages('all', 5, 2, [])).toEqual([1, 2, 3, 4, 5]);
      expect(resolveApplyPages('allButLast', 5, 2, [])).toEqual([1, 2, 3, 4]);
      expect(resolveApplyPages('last', 5, 2, [])).toEqual([5]);
      expect(resolveApplyPages('custom', 12, 1, [3, 5, 7])).toEqual([3, 5, 7]);
    });

    it('falls back to current page when custom list is empty', () => {
      expect(resolveApplyPages('custom', 12, 4, [])).toEqual([4]);
    });
  });
});
