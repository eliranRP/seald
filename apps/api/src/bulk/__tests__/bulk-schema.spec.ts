import type { Template, TemplateField } from 'shared';
import { deriveSlots, validateBulkCsv } from '../bulk-schema';
import { parseCsv } from '../csv-parser';

// The byte order mark a spreadsheet export starts with.
const BOM = String.fromCharCode(0xfeff);

const sig = (role: string, extra: Partial<TemplateField> = {}): TemplateField => ({
  type: 'signature',
  pageRule: 'last',
  x: 60,
  y: 500,
  signerRoleId: role,
  ...extra,
});

function tpl(
  layout: TemplateField[],
  signers: Array<{ id: string; name: string }> = [],
): Pick<Template, 'field_layout' | 'last_signers'> {
  return {
    field_layout: layout,
    last_signers: signers.map((s) => ({ ...s, email: `${s.id}@x.test`, color: '#112233' })),
  };
}

describe('deriveSlots', () => {
  it('orders slots by the saved roster, then by first appearance', () => {
    const d = deriveSlots(
      tpl(
        [sig('c'), sig('b'), sig('a'), sig('z')],
        [
          { id: 'a', name: 'Landlord' },
          { id: 'b', name: 'Tenant' },
        ],
      ),
    );
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.slots.map((s) => s.label)).toEqual(['Landlord', 'Tenant', 'Signer 3', 'Signer 4']);
    expect(d.slots.map((s) => s.name_column)).toEqual([
      'recipient_1_name',
      'recipient_2_name',
      'recipient_3_name',
      'recipient_4_name',
    ]);
    expect(d.slotOfRole.get('a')).toBe(0);
    expect(d.slotOfRole.get('c')).toBe(2);
  });

  it('binds legacy signerIndex fields through the roster', () => {
    const d = deriveSlots(
      tpl(
        [
          { type: 'signature', pageRule: 'last', x: 1, y: 1, signerIndex: 1 },
          { type: 'signature', pageRule: 'last', x: 1, y: 1, signerIndex: 0 },
        ],
        [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      ),
    );
    expect(d.ok && d.slots.map((s) => s.label)).toEqual(['A', 'B']);
  });

  it('gives unbound fields one slot, and joins them to slot 1 when roles exist', () => {
    const lone = deriveSlots(tpl([{ type: 'signature', pageRule: 'last', x: 1, y: 1 }]));
    expect(lone.ok && lone.slots).toHaveLength(1);
    const mixed = deriveSlots(tpl([sig('a'), { type: 'date', pageRule: 'last', x: 1, y: 1 }]));
    expect(mixed.ok && mixed.slotOfRole.get(null)).toBe(0);
  });

  it('refuses a template with no fields, too many signers, or a signer without a signature', () => {
    expect(deriveSlots(tpl([]))).toEqual({ ok: false, reason: 'template_has_no_fields' });
    const many = Array.from({ length: 21 }, (_, i) => sig(`r${i}`));
    expect(deriveSlots(tpl(many))).toEqual({ ok: false, reason: 'template_has_too_many_signers' });
    expect(
      deriveSlots(
        tpl([sig('a'), { type: 'date', pageRule: 'last', x: 1, y: 1, signerRoleId: 'b' }]),
      ),
    ).toEqual({ ok: false, reason: 'template_signer_without_signature_field' });
    // an optional signature does not count
    expect(deriveSlots(tpl([sig('a', { meta: { required: false } })])).ok).toBe(false);
  });
});

describe('validateBulkCsv', () => {
  const two = (() => {
    const d = deriveSlots(tpl([sig('a'), sig('b')]));
    if (!d.ok) throw new Error('bad fixture');
    return d.slots;
  })();
  const run = (csv: string, slots = two) => validateBulkCsv(parseCsv(csv), slots);
  const HEAD = 'recipient_1_name,recipient_1_email,recipient_2_name,recipient_2_email';

  it('accepts a clean row and numbers rows without the header', () => {
    const v = run(`${HEAD}\nAda,ada@example.com,Bob,bob@example.com\n`);
    expect(v.column_errors).toEqual([]);
    expect(v.rows).toEqual([
      {
        row: 1,
        recipients: [
          { name: 'Ada', email: 'ada@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
        title: null,
        errors: [],
      },
    ]);
  });

  it('matches headers case-insensitively, ignores extra columns, and reads the title', () => {
    const v = run(
      `${BOM} Recipient_1_Name ,RECIPIENT_1_EMAIL,recipient_2_name,recipient_2_email,Title,notes\nAda,ada@example.com,Bob,bob@example.com, Lease 4B ,x\n`,
    );
    expect(v.rows[0]?.errors).toEqual([]);
    expect(v.rows[0]?.title).toBe('Lease 4B');
    expect(v.ignored_columns).toEqual(['notes']);
  });

  it('reports a missing column once and on every row', () => {
    const v = run(
      'recipient_1_name,recipient_1_email,recipient_2_name\nAda,ada@example.com,Bob\nCy,cy@example.com,Di\n',
    );
    expect(v.column_errors.map((e) => [e.code, e.column])).toEqual([
      ['missing_column', 'recipient_2_email'],
    ]);
    for (const row of v.rows) {
      expect(row.errors.map((e) => e.code)).toContain('missing_column');
    }
  });

  it('flags bad and missing emails and names per cell', () => {
    const v = run(`${HEAD}\nAda,not-an-email,,bob@example.com\n`);
    expect(v.rows[0]?.errors.map((e) => [e.code, e.column])).toEqual([
      ['bad_email', 'recipient_1_email'],
      ['missing_name', 'recipient_2_name'],
    ]);
  });

  it('flags the same address twice in one row, case-insensitively, on the later slot', () => {
    const v = run(
      `${HEAD}\nAda,Ada@Example.com,Bob,ada@example.com\nCy,cy@example.com,Di,di@example.com\n`,
    );
    expect(v.rows[0]?.errors).toEqual([
      expect.objectContaining({ code: 'duplicate_email', column: 'recipient_2_email' }),
    ]);
    // the same address in a different row is fine
    expect(v.rows[1]?.errors).toEqual([]);
  });

  it('rejects over-long names, addresses and titles', () => {
    const long = 'x'.repeat(201);
    const v = run(
      `${HEAD},title\n${long},ada@example.com,Bob,${'y'.repeat(250)}@example.com,${long}\n`,
    );
    expect(v.rows[0]?.errors.map((e) => e.code).sort()).toEqual([
      'email_too_long',
      'name_too_long',
      'title_too_long',
    ]);
  });

  it('collapses whitespace and control characters in names', () => {
    const v = run(`${HEAD}\n"  Ada \t Love\nlace ",ada@example.com,Bob,bob@example.com\n`);
    expect(v.rows[0]?.recipients[0]?.name).toBe('Ada Love lace');
  });

  it('numbers rows by their place in the file, counting blank lines', () => {
    const v = run(
      `${HEAD}\nAda,ada@example.com,Bob,bob@example.com\n\nCy,cy@example.com,Di,di@example.com\n`,
    );
    expect(v.rows.map((r) => r.row)).toEqual([1, 3]);
  });
});
