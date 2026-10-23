import { BadRequestException } from '@nestjs/common';
import type { AnyFieldKind } from 'shared';
import { validateFieldFill, type FillValidationContext } from '../field-value-validator';

const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

function ctx(
  kind: AnyFieldKind,
  meta: Record<string, unknown> = {},
  extra: Partial<FillValidationContext> = {},
): FillValidationContext {
  return { kind, meta, signerName: 'Ada Lovelace', dateFormat: null, timezone: null, ...extra };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequestException);
    return (err as BadRequestException).message;
  }
  throw new Error('expected a 400');
}

describe('validateFieldFill (WP-07)', () => {
  type Row = [string, FillValidationContext, string, string]; // title, ctx, input, expected text or error code
  const rows: Row[] = [
    ['text ok', ctx('text', { char_limit: 3 }), 'abc', 'abc'],
    ['text too long', ctx('text', { char_limit: 3 }), 'abcd', 'field_value_too_long'],
    ['name ok', ctx('name'), 'Grace', 'Grace'],
    ['name blank falls back to the signer', ctx('name'), '  ', 'Ada Lovelace'],
    ['email ok', ctx('email'), 'ada@example.com', 'ada@example.com'],
    ['email bad', ctx('email'), 'ada@', 'field_value_invalid_email'],
    ['number ok (trimmed)', ctx('number', { min: 0, max: 100 }), ' 42 ', '42'],
    ['number nan', ctx('number'), 'forty', 'field_value_not_a_number'],
    ['number below min', ctx('number', { min: 1 }), '0', 'field_value_out_of_range'],
    ['number above max', ctx('number', { max: 5 }), '6', 'field_value_out_of_range'],
    ['radio ok', ctx('radio', { options: OPTIONS }), 'l', 'l'],
    ['radio unknown', ctx('radio', { options: OPTIONS }), 'xl', 'field_value_not_in_options'],
    ['dropdown ok', ctx('dropdown', { options: OPTIONS }), 's', 's'],
    [
      'dropdown by label',
      ctx('dropdown', { options: OPTIONS }),
      'Small',
      'field_value_not_in_options',
    ],
    ['date ISO, no format keeps it', ctx('date'), '2026-01-05', '2026-01-05'],
    [
      'date ISO re-rendered in the envelope format',
      ctx('date', {}, { dateFormat: 'dd.MM.yyyy' }),
      '2026-01-05',
      '05.01.2026',
    ],
    [
      'date instant uses the envelope timezone',
      ctx('date', {}, { dateFormat: 'yyyy-MM-dd', timezone: 'Asia/Tokyo' }),
      '2026-01-05T23:30:00Z',
      '2026-01-06',
    ],
    ['date garbage', ctx('date'), 'next tuesday', 'field_value_invalid_date'],
    ['date impossible', ctx('date'), '2026-02-30', 'field_value_invalid_date'],
  ];

  it.each(rows)('%s', (_title, c, input, expected) => {
    if (expected.startsWith('field_')) {
      expect(codeOf(() => validateFieldFill(c, { value_text: input }))).toBe(expected);
    } else {
      expect(validateFieldFill(c, { value_text: input }).value_text).toBe(expected);
    }
  });

  describe('read_only', () => {
    it('accepts exactly the default', () => {
      const c = ctx('text', { read_only: true, default: 'fixed' });
      expect(validateFieldFill(c, { value_text: 'fixed' }).value_text).toBe('fixed');
      expect(codeOf(() => validateFieldFill(c, { value_text: 'other' }))).toBe('field_read_only');
    });

    it('rejects everything when there is no default', () => {
      const c = ctx('text', { read_only: true });
      expect(codeOf(() => validateFieldFill(c, { value_text: 'x' }))).toBe('field_read_only');
    });

    it('compares a number default as text', () => {
      const c = ctx('number', { read_only: true, default: 7 });
      expect(validateFieldFill(c, { value_text: '7' }).value_text).toBe('7');
      expect(codeOf(() => validateFieldFill(c, { value_text: '8' }))).toBe('field_read_only');
    });

    it('rejects a read-only checkbox', () => {
      const c = ctx('checkbox', { read_only: true });
      expect(codeOf(() => validateFieldFill(c, { value_boolean: true }))).toBe('field_read_only');
    });
  });

  it('checkbox passes through untouched', () => {
    expect(validateFieldFill(ctx('checkbox'), { value_boolean: false })).toEqual({
      value_boolean: false,
    });
  });
});
