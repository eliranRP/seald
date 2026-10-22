/**
 * Small RFC 4180 CSV reader for bulk send (WP-36). It handles what
 * spreadsheet exports produce: a UTF-8 BOM, CRLF / LF / CR line ends,
 * quoted fields with `""` escapes and embedded line breaks, and ragged
 * rows. Comma is the only delimiter.
 *
 * Blank records (every cell empty after trimming) are dropped, but every
 * record keeps its 1-based position in the file (`record`, the header is
 * record 1), so a sender can find "row 7" in the spreadsheet they uploaded.
 */

export type CsvParseErrorCode = 'unterminated_quote' | 'null_byte' | 'bad_quote';

export class CsvParseError extends Error {
  constructor(
    readonly code: CsvParseErrorCode,
    /** 1-based record the problem starts in. */
    readonly record: number,
  ) {
    super(`csv_${code}`);
    this.name = 'CsvParseError';
  }
}

export interface CsvRecord {
  /** 1-based record number in the file; the header is record 1. */
  readonly record: number;
  readonly cells: ReadonlyArray<string>;
}

export function parseCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.includes('\u0000')) throw new CsvParseError('null_byte', 1);

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false; // inside a quoted field
  let fieldWasQuoted = false; // the current field started with a quote
  let record = 1;
  let recordStart = 1;

  const endField = (): void => {
    cells.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRecord = (): void => {
    endField();
    if (cells.some((c) => c.trim().length > 0)) records.push({ record: recordStart, cells });
    cells = [];
    record += 1;
    recordStart = record;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') record += 1;
        else if (ch === '\r' && text[i + 1] !== '\n') record += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      // A quote opens a field only at its very start; a stray quote in the
      // middle of an unquoted field is a malformed file, not data.
      if (field.trim().length === 0 && !fieldWasQuoted) {
        field = '';
        quoted = true;
        fieldWasQuoted = true;
        continue;
      }
      throw new CsvParseError('bad_quote', recordStart);
    }
    if (fieldWasQuoted && ch !== ',' && ch !== '\n' && ch !== '\r') {
      // Only spaces may follow a closing quote.
      if (ch === ' ' || ch === '\t') continue;
      throw new CsvParseError('bad_quote', recordStart);
    }
    if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRecord();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRecord();
    } else {
      field += ch;
    }
  }
  if (quoted) throw new CsvParseError('unterminated_quote', recordStart);
  // Last record without a trailing line break.
  if (field.length > 0 || cells.length > 0 || fieldWasQuoted) endRecord();
  return records;
}
