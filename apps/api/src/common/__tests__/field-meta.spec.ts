import {
  ALL_FIELD_KINDS,
  calendarDateInZone,
  formatCalendarDate,
  formatNumberValue,
  isValidTimeZone,
  parseDateValue,
  parseFieldMeta,
  renderDateValue,
  validateTextValue,
  type AnyFieldKind,
} from 'shared';

const OPTIONS = [
  { label: 'Small', value: 's' },
  { label: 'Large', value: 'l' },
];

describe('parseFieldMeta (WP-07)', () => {
  it('knows ten kinds', () => {
    expect([...ALL_FIELD_KINDS]).toEqual([
      'signature',
      'initials',
      'date',
      'text',
      'checkbox',
      'email',
      'name',
      'number',
      'radio',
      'dropdown',
    ]);
  });

  it.each(ALL_FIELD_KINDS.filter((k) => k !== 'radio' && k !== 'dropdown'))(
    '%s: empty or absent meta is valid and becomes {}',
    (kind) => {
      expect(parseFieldMeta(kind, undefined)).toEqual({ ok: true, meta: {} });
      expect(parseFieldMeta(kind, null)).toEqual({ ok: true, meta: {} });
      expect(parseFieldMeta(kind, {})).toEqual({ ok: true, meta: {} });
    },
  );

  it.each(ALL_FIELD_KINDS)('%s: accepts the common options', (kind) => {
    const common = {
      label: 'L',
      placeholder: 'p',
      required: false,
      read_only: false,
      font_size: 14,
    };
    const meta = kind === 'radio' || kind === 'dropdown' ? { ...common, options: OPTIONS } : common;
    expect(parseFieldMeta(kind, meta)).toEqual({ ok: true, meta });
  });

  it.each(['signature', 'initials', 'date', 'email', 'checkbox', 'name', 'text', 'number'])(
    '%s: rejects read_only without a default, since nobody could fill it',
    (kind) => {
      expect(parseFieldMeta(kind, { read_only: true })).toEqual({
        ok: false,
        issues: [{ path: 'meta.read_only', message: 'read_only requires a default value' }],
      });
    },
  );

  it('accepts read_only with a default on kinds that have one', () => {
    expect(parseFieldMeta('text', { read_only: true, default: 'Acme' }).ok).toBe(true);
    expect(parseFieldMeta('number', { read_only: true, default: 7 }).ok).toBe(true);
    expect(
      parseFieldMeta('radio', { read_only: true, options: OPTIONS, default: OPTIONS[0]!.value }).ok,
    ).toBe(true);
    expect(parseFieldMeta('radio', { read_only: true, options: OPTIONS }).ok).toBe(false);
  });

  it.each([7, 97, 12.5, '12'])('rejects font_size %p', (font_size) => {
    expect(parseFieldMeta('text', { font_size }).ok).toBe(false);
  });

  it('accepts font_size at both bounds', () => {
    expect(parseFieldMeta('text', { font_size: 8 }).ok).toBe(true);
    expect(parseFieldMeta('text', { font_size: 96 }).ok).toBe(true);
  });

  it('rejects unknown keys and keys of another kind', () => {
    expect(parseFieldMeta('text', { colour: 'red' }).ok).toBe(false);
    expect(parseFieldMeta('text', { min: 1 }).ok).toBe(false);
    expect(parseFieldMeta('checkbox', { char_limit: 3 }).ok).toBe(false);
    expect(parseFieldMeta('number', { char_limit: 3 }).ok).toBe(false);
  });

  it('rejects a kind key, arrays and scalars', () => {
    expect(parseFieldMeta('text', { kind: 'text' }).ok).toBe(false);
    expect(parseFieldMeta('text', []).ok).toBe(false);
    expect(parseFieldMeta('text', 'x').ok).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(parseFieldMeta('hologram', {}).ok).toBe(false);
  });

  it('text: char_limit and default', () => {
    expect(parseFieldMeta('text', { char_limit: 20, default: 'hi' })).toEqual({
      ok: true,
      meta: { char_limit: 20, default: 'hi' },
    });
    expect(parseFieldMeta('text', { char_limit: 0 }).ok).toBe(false);
    expect(parseFieldMeta('text', { char_limit: 501 }).ok).toBe(false);
  });

  it('number: min, max, format, default', () => {
    expect(parseFieldMeta('number', { min: 0, max: 10, format: 'fixed2', default: 5 }).ok).toBe(
      true,
    );
    expect(parseFieldMeta('number', { min: 5, max: 1 }).ok).toBe(false);
    expect(parseFieldMeta('number', { min: 0, max: 10, default: 11 }).ok).toBe(false);
    expect(parseFieldMeta('number', { format: 'roman' }).ok).toBe(false);
  });

  it.each(['radio', 'dropdown'] as const)('%s: options are required, unique, bounded', (kind) => {
    expect(parseFieldMeta(kind, {}).ok).toBe(false);
    expect(parseFieldMeta(kind, { options: [] }).ok).toBe(false);
    expect(parseFieldMeta(kind, { options: OPTIONS, default: 'l' }).ok).toBe(true);
    const dup = parseFieldMeta(kind, {
      options: [
        { label: 'A', value: 'x' },
        { label: 'B', value: 'x' },
      ],
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.issues[0]?.path).toBe('meta.options.1.value');
    expect(parseFieldMeta(kind, { options: OPTIONS, default: 'xl' }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ label: `o${i}`, value: `v${i}` }));
    expect(parseFieldMeta(kind, { options: many }).ok).toBe(false);
    expect(parseFieldMeta(kind, { options: many.slice(0, 50) }).ok).toBe(true);
    expect(parseFieldMeta(kind, { options: [{ label: 'A', value: '' }] }).ok).toBe(false);
  });
});

describe('validateTextValue (WP-07)', () => {
  type Row = [AnyFieldKind, Record<string, unknown>, string, string | null];
  const rows: Row[] = [
    ['text', {}, 'anything', null],
    ['text', { char_limit: 5 }, '12345', null],
    ['text', { char_limit: 5 }, '123456', 'field_value_too_long'],
    ['text', {}, 'x'.repeat(501), 'field_value_too_long'],
    ['name', {}, 'Ada', null],
    ['name', {}, '   ', 'field_value_empty'],
    ['email', {}, 'a@b.co', null],
    ['email', {}, 'a@b', 'field_value_invalid_email'],
    ['email', {}, 'a b@c.de', 'field_value_invalid_email'],
    ['email', {}, '@c.de', 'field_value_invalid_email'],
    ['number', {}, '12', null],
    ['number', {}, '-3.5', null],
    ['number', {}, '1e3', 'field_value_not_a_number'],
    ['number', {}, 'abc', 'field_value_not_a_number'],
    ['number', { min: 1, max: 10 }, '1', null],
    ['number', { min: 1, max: 10 }, '10', null],
    ['number', { min: 1, max: 10 }, '0.99', 'field_value_out_of_range'],
    ['number', { min: 1, max: 10 }, '10.01', 'field_value_out_of_range'],
    ['radio', { options: OPTIONS }, 's', null],
    ['radio', { options: OPTIONS }, 'Small', 'field_value_not_in_options'],
    ['dropdown', { options: OPTIONS }, 'l', null],
    ['dropdown', { options: OPTIONS }, 'm', 'field_value_not_in_options'],
    ['dropdown', {}, 'm', 'field_value_not_in_options'],
    ['date', {}, 'whatever', null],
  ];
  it.each(rows)('%s %j %j -> %s', (kind, meta, value, expected) => {
    expect(validateTextValue(kind, meta, value)).toBe(expected);
  });
});

describe('formatNumberValue', () => {
  it.each([
    ['1234567.5', 'plain', '1234567.5'],
    ['1234567.5', 'thousands', '1,234,567.5'],
    ['1234567.5', 'fixed2', '1234567.50'],
    ['1234567.5', 'thousands_fixed2', '1,234,567.50'],
    ['-1234', 'thousands', '-1,234'],
    ['12', undefined, '12'],
    ['nope', 'thousands', 'nope'],
  ] as const)('%s with %s -> %s', (text, format, expected) => {
    expect(formatNumberValue(text, format)).toBe(expected);
  });
});

describe('date formatting', () => {
  const d = { year: 2026, month: 1, day: 5 };
  it.each([
    ['yyyy-MM-dd', '2026-01-05'],
    ['MM/dd/yyyy', '01/05/2026'],
    ['dd/MM/yyyy', '05/01/2026'],
    ['dd.MM.yyyy', '05.01.2026'],
    ['MMM d, yyyy', 'Jan 5, 2026'],
    ['d MMMM yyyy', '5 January 2026'],
  ] as const)('formats %s', (format, expected) => {
    expect(formatCalendarDate(d, format)).toBe(expected);
    expect(parseDateValue(expected, { format })).toEqual(d);
  });

  it('reads an instant in the envelope timezone', () => {
    const instant = '2026-01-05T23:30:00Z';
    expect(parseDateValue(instant, { timeZone: 'UTC' })).toEqual(d);
    expect(parseDateValue(instant, { timeZone: 'Asia/Tokyo' })).toEqual({ ...d, day: 6 });
    expect(calendarDateInZone(new Date(instant), 'America/Los_Angeles')).toEqual(d);
  });

  it('breaks the dd/MM vs MM/dd tie with the envelope format', () => {
    expect(parseDateValue('03/04/2026', { format: 'dd/MM/yyyy' })).toEqual({
      year: 2026,
      month: 4,
      day: 3,
    });
    expect(parseDateValue('03/04/2026', { format: 'MM/dd/yyyy' })).toEqual({
      year: 2026,
      month: 3,
      day: 4,
    });
  });

  it.each(['', 'tomorrow', '2026-02-30', '31/31/2026', '2026-13-01', '2026-01-05T10:00'])(
    'rejects %p',
    (text) => {
      expect(parseDateValue(text)).toBeNull();
    },
  );

  it('renderDateValue keeps the text without a format, and re-renders with one', () => {
    expect(renderDateValue('Jan 5, 2026', { format: null })).toBe('Jan 5, 2026');
    expect(renderDateValue('2026-01-05', { format: 'dd.MM.yyyy' })).toBe('05.01.2026');
    expect(renderDateValue('not a date', { format: 'dd.MM.yyyy' })).toBe('not a date');
  });

  it('validates timezones', () => {
    expect(isValidTimeZone('Europe/Berlin')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
