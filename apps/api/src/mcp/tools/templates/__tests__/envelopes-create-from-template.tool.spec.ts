import {
  OTHER_OWNER,
  OWNER,
  err,
  ok,
  resetFlags,
  setFlags,
  staged,
  write,
} from '../../__tests__/write-harness';
import {
  callStep,
  seedTemplate,
  stepWorld,
  type StepWorld,
} from '../../contacts/__tests__/step-world';

const ROSTER = [
  { id: 'a', name: 'Landlord', email: 'l@example.com', color: '#111111', signing_order: 1 },
  { id: 'b', name: 'Tenant', email: 't@example.com', color: '#222222', signing_order: 2 },
];
const LAYOUT = [
  { type: 'signature', pageRule: 'last', x: 100, y: 600, signerRoleId: 'a' },
  { type: 'initial', pageRule: 'allButLast', x: 50, y: 700, signerRoleId: 'a' },
  { type: 'date', pageRule: 'first', x: 300, y: 600, signerRoleId: 'b' },
] as const;

const SIGNERS = [
  { email: 'ada@example.com', name: 'Ada' },
  { email: 'bob@example.com', name: 'Bob' },
];

async function setup(opts: { delivery_mode?: 'sequential' } = {}): Promise<{
  w: StepWorld;
  templateId: string;
}> {
  const w = stepWorld();
  const t = await seedTemplate(w, {
    field_layout: LAYOUT,
    last_signers: ROSTER,
    ...(opts.delivery_mode ? { delivery_mode: opts.delivery_mode } : {}),
  });
  return { w, templateId: t.id };
}

interface EnvelopeOut {
  envelope: {
    id: string;
    status: string;
    delivery_mode?: string;
    signers: Array<{ id: string; email: string; signing_order: number }>;
    fields: Array<{
      kind: string;
      page: number;
      signer_id: string;
      x: number;
      y: number;
      width: number | null;
      height: number | null;
    }>;
  };
  uses_count: number;
}

describe('envelopes_create_from_template', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('makes a draft with the layout on every page the rule names and counts one use', async () => {
    const { w, templateId } = await setup();
    const document_id = await staged(w, 3);
    const out = ok(
      await callStep(
        w,
        'envelopes_create_from_template',
        write({ template_id: templateId, title: 'Lease', document_id, signers: SIGNERS }),
      ),
    ) as unknown as EnvelopeOut;

    expect(out.uses_count).toBe(1);
    expect(out.envelope.status).toBe('draft');
    expect(out.envelope.signers.map((s) => s.email)).toEqual([
      'ada@example.com',
      'bob@example.com',
    ]);
    // signature (last) + initials (pages 1 and 2) + date (first) = 4 fields.
    expect(out.envelope.fields).toHaveLength(4);
    const [ada, bob] = out.envelope.signers;
    const kinds = out.envelope.fields.map((f) => `${f.kind}:${f.page}`).sort();
    expect(kinds).toEqual(['date:1', 'initials:1', 'initials:2', 'signature:3']);
    for (const f of out.envelope.fields) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(1);
      expect(f.y).toBeLessThanOrEqual(1);
      expect(f.width).toBeGreaterThan(0);
      // Slot 1 signs the signature and initials, slot 2 the date.
      expect(f.signer_id).toBe(f.kind === 'date' ? bob?.id : ada?.id);
    }
    // Parallel template: nothing sequential, nothing sent.
    expect(out.envelope.delivery_mode ?? 'parallel').toBe('parallel');
    expect((await w.templatesRepo.findOneByOwner(OWNER, templateId))?.uses_count).toBe(1);
  });

  it('keeps a sequential template order while signing order is on', async () => {
    const { w, templateId } = await setup({ delivery_mode: 'sequential' });
    const out = ok(
      await callStep(
        w,
        'envelopes_create_from_template',
        write({
          template_id: templateId,
          title: 'Lease',
          document_id: await staged(w, 2),
          signers: SIGNERS,
        }),
      ),
    ) as unknown as EnvelopeOut;
    expect(out.envelope.delivery_mode).toBe('sequential');
    expect(out.envelope.signers.map((s) => s.signing_order)).toEqual([1, 2]);
  });

  it('ignores the stored order while signing order is off', async () => {
    setFlags({ signingOrder: false });
    const { w, templateId } = await setup({ delivery_mode: 'sequential' });
    const out = ok(
      await callStep(
        w,
        'envelopes_create_from_template',
        write({
          template_id: templateId,
          title: 'Lease',
          document_id: await staged(w, 2),
          signers: SIGNERS,
        }),
      ),
    ) as unknown as EnvelopeOut;
    expect(out.envelope.delivery_mode ?? 'parallel').toBe('parallel');
  });

  it('refuses a wrong signer count, a repeated email and a template with no layout', async () => {
    const { w, templateId } = await setup();
    const document_id = await staged(w, 2);
    const base = { template_id: templateId, title: 'Lease', document_id };
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ ...base, signers: [SIGNERS[0]] }),
        ),
      ).slug,
    ).toBe('template_signer_count_mismatch');
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ ...base, signers: [SIGNERS[0], SIGNERS[0]] }),
        ),
      ).slug,
    ).toBe('signer_email_taken');
    const empty = await seedTemplate(w, { title: 'Empty', field_layout: [] });
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ ...base, template_id: empty.id, signers: [SIGNERS[0]] }),
        ),
      ).slug,
    ).toBe('template_has_no_fields');
    // A numeric page rule past the end of the PDF leaves nothing to place.
    const far = await seedTemplate(w, {
      title: 'Far',
      field_layout: [{ type: 'signature', pageRule: 9, x: 1, y: 1 }],
    });
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ ...base, template_id: far.id, signers: [SIGNERS[0]] }),
        ),
      ).slug,
    ).toBe('template_has_no_fields');
    // None of it made an envelope or a use.
    expect(w.envelopesRepo.envelopes.size).toBe(0);
    expect((await w.templatesRepo.findOneByOwner(OWNER, templateId))?.uses_count).toBe(0);
  });

  it('counts no use and leaves no draft when a signer cannot be added', async () => {
    const { w, templateId } = await setup();
    const document_id = await staged(w, 2);
    const res = await callStep(
      w,
      'envelopes_create_from_template',
      write({
        template_id: templateId,
        title: 'Lease',
        document_id,
        signers: [
          { email: 'ada@example.com', name: 'Ada' },
          { contact_id: '11111111-1111-4111-8111-111111111111' },
        ],
      }),
    );
    expect(err(res).slug).toBe('contact_not_found');
    expect(w.envelopesRepo.envelopes.size).toBe(0);
    expect((await w.templatesRepo.findOneByOwner(OWNER, templateId))?.uses_count).toBe(0);
  });

  it("does not use another owner's template or upload", async () => {
    const { w, templateId } = await setup();
    const theirs = await seedTemplate(w, {
      owner: OTHER_OWNER,
      field_layout: LAYOUT,
      last_signers: ROSTER,
    });
    const document_id = await staged(w, 2);
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ template_id: theirs.id, title: 'X', document_id, signers: SIGNERS }),
        ),
      ).slug,
    ).toBe('template_not_found');
    // Nor can another owner attach this owner's staged upload to their own template.
    const res = await callStep(
      w,
      'envelopes_create_from_template',
      write({ template_id: theirs.id, title: 'X', document_id, signers: SIGNERS }),
      { owner: OTHER_OWNER },
    );
    expect(err(res).slug).toBe('upload_not_found');
    // And this owner's template is not reachable as theirs.
    expect(
      err(
        await callStep(
          w,
          'envelopes_create_from_template',
          write({ template_id: templateId, title: 'X', document_id, signers: SIGNERS }),
          { owner: OTHER_OWNER },
        ),
      ).slug,
    ).toBe('template_not_found');
  });

  it('dry run reports the plan and writes nothing; scopes are enforced', async () => {
    const { w, templateId } = await setup();
    const document_id = await staged(w, 3);
    const dry = ok(
      await callStep(w, 'envelopes_create_from_template', {
        idempotency_key: 'dry-00000006',
        dry_run: true,
        template_id: templateId,
        title: 'Lease',
        document_id,
        signers: SIGNERS,
      }),
    );
    expect(dry).toMatchObject({
      dry_run: true,
      would: { template_id: templateId, pages: 3, fields: 4, signers: 2, sends: false },
    });
    expect(w.envelopesRepo.envelopes.size).toBe(0);
    expect((await w.templatesRepo.findOneByOwner(OWNER, templateId))?.uses_count).toBe(0);
    for (const scopes of [['templates:read'], ['envelopes:write']] as const) {
      expect(
        err(
          await callStep(
            w,
            'envelopes_create_from_template',
            write({ template_id: templateId, title: 'X', document_id, signers: SIGNERS }),
            { scopes },
          ),
        ).slug,
      ).toBe('insufficient_scope');
    }
  });
});
