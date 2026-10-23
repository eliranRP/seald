import { OTHER_OWNER, err, ok, resetFlags, setFlags } from '../../__tests__/write-harness';
import { callStep, seedTemplate, stepWorld } from '../../contacts/__tests__/step-world';

const ROSTER = [
  { id: 'a', name: 'Landlord', email: 'l@example.com', color: '#111111', signing_order: 1 },
  { id: 'b', name: 'Tenant', email: 't@example.com', color: '#222222', signing_order: 2 },
];
const LAYOUT = [
  { type: 'signature', pageRule: 'last', x: 10, y: 10, signerRoleId: 'a' },
  { type: 'initial', pageRule: 'allButLast', x: 10, y: 80, signerRoleId: 'b', label: 'Initials' },
  { type: 'date', pageRule: 2, x: 10, y: 120, meta: { required: false } },
] as const;

describe('templates_get_schema', () => {
  afterEach(() => resetFlags());

  it('spells initial as initials, binds fields to slots and defaults required', async () => {
    setFlags();
    const w = stepWorld();
    const t = await seedTemplate(w, { field_layout: LAYOUT, last_signers: ROSTER });
    const out = ok(await callStep(w, 'templates_get_schema', { template_id: t.id }));
    expect(out).toMatchObject({
      template_id: t.id,
      delivery_mode: 'parallel',
      signer_slots: [
        { slot: 1, name: 'Landlord', signing_order: null },
        { slot: 2, name: 'Tenant', signing_order: null },
      ],
    });
    expect(out['fields']).toEqual([
      { kind: 'signature', label: null, required: true, page_rule: 'last', signer_slot: 1 },
      {
        kind: 'initials',
        label: 'Initials',
        required: true,
        page_rule: 'allButLast',
        signer_slot: 2,
      },
      // No role: first slot. meta.required false is honoured.
      { kind: 'date', label: null, required: false, page_rule: 2, signer_slot: 1 },
    ]);
  });

  it('reports the sequential order only while signing order is on', async () => {
    const w = stepWorld();
    const t = await seedTemplate(w, {
      field_layout: LAYOUT,
      last_signers: ROSTER,
      delivery_mode: 'sequential',
    });
    setFlags({ signingOrder: true });
    const on = ok(await callStep(w, 'templates_get_schema', { template_id: t.id }));
    expect(on['delivery_mode']).toBe('sequential');
    expect(
      (on['signer_slots'] as Array<{ signing_order: number }>).map((s) => s.signing_order),
    ).toEqual([1, 2]);
    setFlags({ signingOrder: false });
    const off = ok(await callStep(w, 'templates_get_schema', { template_id: t.id }));
    expect(off['delivery_mode']).toBe('parallel');
  });

  it('makes one slot per role for a template saved without a roster', async () => {
    setFlags();
    const w = stepWorld();
    const t = await seedTemplate(w, {
      field_layout: [{ type: 'signature', pageRule: 'first', x: 1, y: 1 }],
    });
    const out = ok(await callStep(w, 'templates_get_schema', { template_id: t.id }));
    expect(out['signer_slots']).toEqual([{ slot: 1, name: null, signing_order: null }]);
  });

  it("answers another owner's template like a missing one, and needs templates:read", async () => {
    setFlags();
    const w = stepWorld();
    const theirs = await seedTemplate(w, { owner: OTHER_OWNER, field_layout: LAYOUT });
    expect(err(await callStep(w, 'templates_get_schema', { template_id: theirs.id })).slug).toBe(
      'template_not_found',
    );
    expect(
      err(
        await callStep(
          w,
          'templates_get_schema',
          { template_id: theirs.id },
          { scopes: ['envelopes:read'] },
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
