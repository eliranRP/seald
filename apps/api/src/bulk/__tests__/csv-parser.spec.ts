import { CsvParseError, parseCsv } from '../csv-parser';

const cells = (input: string) => parseCsv(input).map((r) => r.cells);

describe('parseCsv', () => {
  it('reads a plain header and rows with LF', () => {
    expect(cells('a,b\n1,2\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('reads CRLF, bare CR and a missing final newline the same way', () => {
    const expected = [
      ['a', 'b'],
      ['1', '2'],
    ];
    expect(cells('a,b\r\n1,2\r\n')).toEqual(expected);
    expect(cells('a,b\r1,2\r')).toEqual(expected);
    expect(cells('a,b\n1,2')).toEqual(expected);
  });

  it('strips a UTF-8 byte order mark from the first cell', () => {
    expect(cells('﻿recipient_1_name,recipient_1_email\nAda,ada@example.com\n')[0]).toEqual([
      'recipient_1_name',
      'recipient_1_email',
    ]);
  });

  it('handles quoted fields: commas, doubled quotes and line breaks inside', () => {
    expect(cells('name,note\n"Lovelace, Ada","she said ""hi"""\n"two\nlines",x\n')).toEqual([
      ['name', 'note'],
      ['Lovelace, Ada', 'she said "hi"'],
      ['two\nlines', 'x'],
    ]);
  });

  it('keeps a quoted CRLF inside a field and counts it as one line break', () => {
    const records = parseCsv('a,b\r\n"x\r\ny",1\r\nlast,2\r\n');
    expect(records[1]?.cells).toEqual(['x\r\ny', '1']);
    // header = 1, the multi-line record starts at 2, the next one at 4.
    expect(records.map((r) => r.record)).toEqual([1, 2, 4]);
  });

  it('allows an empty quoted field and spaces around a quoted field', () => {
    expect(cells('a,b,c\n"", "x" ,y\n')).toEqual([
      ['a', 'b', 'c'],
      ['', 'x', 'y'],
    ]);
  });

  it('keeps extra columns and ragged rows as they come', () => {
    expect(cells('a,b\n1,2,3\n4\n')).toEqual([['a', 'b'], ['1', '2', '3'], ['4']]);
  });

  it('drops empty rows but keeps the position of the rows after them', () => {
    const records = parseCsv('a,b\n\n1,2\n , \n,\n3,4\n');
    expect(records.map((r) => r.cells)).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(records.map((r) => r.record)).toEqual([1, 3, 6]);
  });

  it('returns nothing for an empty or whitespace-only file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\r\n  \n')).toEqual([]);
  });

  it('keeps a trailing empty cell', () => {
    expect(cells('a,b\n1,\n')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('rejects an unterminated quote with the record it starts in', () => {
    try {
      parseCsv('a,b\n1,"oops\n2,3\n');
      throw new Error('expected parseCsv to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvParseError);
      expect((err as CsvParseError).code).toBe('unterminated_quote');
      expect((err as CsvParseError).record).toBe(2);
    }
  });

  it('rejects a stray quote in an unquoted field and text after a closing quote', () => {
    expect(() => parseCsv('a,b\nx"y,1\n')).toThrow(CsvParseError);
    expect(() => parseCsv('a,b\n"x"y,1\n')).toThrow(CsvParseError);
  });

  it('rejects a NUL byte', () => {
    expect(() => parseCsv('a,b\n1,\u00002\n')).toThrow(CsvParseError);
  });
});
