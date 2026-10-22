import { McpEnvelopeSchema } from 'shared';
import {
  OWNER,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  staged,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

const signers = [
  { email: 'ada@example.com', name: 'Ada', signing_order: 1 },
  { email: 'bob@example.com', name: 'Bob', signing_order: 2 },
];

const field = (signer_index: number, document_index = 0) => ({
  signer_index,
  document_index,
  kind: 'signature',
  page: 1,
  x: 0.1,
  y: 0.7,
  width: 0.3,
  height: 0.05,
});

describe('envelopes_prepare', () => {
  afterEach(() => resetFlags());

  it('builds a two-document draft with ordered signers, fields and settings in one call', async () => {
    setFlags();
    const w = writeWorld();
    const a = await staged(w, 2, 'msa.pdf');
    const b = await staged(w, 1, 'annex.pdf');
    const out = ok(
      await callWrite(
        w,
        'envelopes_prepare',
        write({
          title: 'MSA',
          documents: [{ document_id: a }, { document_id: b, title: 'Annex A' }],
          signers,
          fields: [field(0, 0), field(1, 1)],
          delivery_mode: 'sequential',
          tags: ['msa'],
          reminder_interval_days: 2,
        }),
      ),
    );
    expect(McpEnvelopeSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      title: 'MSA',
      status: 'draft',
      delivery_mode: 'sequential',
      tags: ['msa'],
      reminder_interval_days: 2,
      sent_at: null,
    });
    const docs = out['documents'] as Array<{ id: string; title: string; original_pages: number }>;
    expect(docs.map((d) => [d.title, d.original_pages])).toEqual([
      ['msa', 2],
      ['Annex A', 1],
    ]);
    const sig = out['signers'] as Array<{ id: string; email: string; signing_order: number }>;
    expect(sig.map((s) => [s.email, s.signing_order])).toEqual([
      ['ada@example.com', 1],
      ['bob@example.com', 2],
    ]);
    const fields = out['fields'] as Array<{ signer_id: string; document_id: string }>;
    expect(fields.map((f) => [f.signer_id, f.document_id])).toEqual([
      [sig[0]?.id, docs[0]?.id],
      [sig[1]?.id, docs[1]?.id],
    ]);
    // Uploads attach once.
    expect(
      err(await callWrite(w, 'envelopes_prepare', write({ title: 'Again', document_id: a }))).slug,
    ).toBe('upload_already_attached');
  });

  it('dry run checks the sources and writes nothing', async () => {
    setFlags();
    const w = writeWorld();
    const a = await staged(w);
    const out = ok(
      await callWrite(w, 'envelopes_prepare', {
        title: 'MSA',
        document_id: a,
        signers,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(out).toMatchObject({ dry_run: true, would: { sends: false, signers: 2 } });
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(0);
    expect((await w.uploadsRepo.find(OWNER, a))?.consumed_at).toBeNull();
  });

  it('imports a Drive source first and records its name for envelopes_search', async () => {
    setFlags();
    const w = writeWorld();
    w.drive.files.set('drivefile0001', {
      id: 'drivefile0001',
      name: 'Q3 Contract',
      mimeType: 'application/vnd.google-apps.document',
      size: null,
    });
    const out = ok(
      await callWrite(
        w,
        'envelopes_prepare',
        write({ title: 'From Drive', source: { gdrive_file_id: 'drivefile0001' } }),
      ),
    );
    const doc = (out['documents'] as Array<{ id: string }>)[0];
    expect(w.uploadsRepo.driveSources.get(`${out['id'] as string}/${doc?.id ?? ''}`)).toBe(
      'Q3 Contract',
    );
    // gdrive:read is needed for a Drive source.
    expect(
      err(
        await callWrite(
          w,
          'envelopes_prepare',
          write({ title: 'x', source: { gdrive_file_id: 'drivefile0001' } }),
          {
            scopes: ['envelopes:write', 'documents:write'],
          },
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });

  it('reports a slow Drive conversion as conversion_pending and creates no draft', async () => {
    setFlags();
    const w = writeWorld();
    w.drive.mode = 'pending';
    w.drive.files.set('drivefile0002', {
      id: 'drivefile0002',
      name: 'Big',
      mimeType: 'application/pdf',
      size: 10,
    });
    const out = err(
      await callWrite(
        w,
        'envelopes_prepare',
        write({ title: 'x', source: { gdrive_file_id: 'drivefile0002' } }),
      ),
    );
    expect(out.slug).toBe('conversion_pending');
    expect(out.next_steps).toEqual([
      { tool: 'gdrive_conversion_status', args: { job_id: expect.any(String) } },
    ]);
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(0);
  });

  it('validates indexes, flags and the one-source rule before writing anything', async () => {
    setFlags();
    const w = writeWorld();
    const a = await staged(w);
    const cases: Array<Record<string, unknown>> = [
      { title: 'x' },
      { title: 'x', document_id: a, documents: [{ document_id: a }] },
      { title: 'x', document_id: a, signers, fields: [field(5)] },
      { title: 'x', document_id: a, signers, fields: [field(0, 3)] },
      { title: 'x', documents: [{ document_id: a }, { document_id: a }] },
      { title: 'x', document_id: a, signers, delivery_mode: 'parallel' },
    ];
    for (const args of cases) {
      expect(err(await callWrite(w, 'envelopes_prepare', write(args))).slug).toBe(
        'validation_error',
      );
    }
    setFlags({ signingOrder: false });
    expect(
      err(await callWrite(w, 'envelopes_prepare', write({ title: 'x', document_id: a, signers })))
        .slug,
    ).toBe('validation_error');
    setFlags({ multiDocumentEnvelopes: false });
    const b = await staged(w);
    expect(
      err(
        await callWrite(
          w,
          'envelopes_prepare',
          write({ title: 'x', documents: [{ document_id: a }, { document_id: b }] }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(0);
  });

  it('works on one document with multi-document envelopes off', async () => {
    setFlags({ multiDocumentEnvelopes: false });
    const w = writeWorld();
    const a = await staged(w, 3);
    const out = ok(
      await callWrite(
        w,
        'envelopes_prepare',
        write({
          title: 'One',
          document_id: a,
          signers: [{ email: 'a@example.com', name: 'A' }],
          fields: [field(0)],
        }),
      ),
    );
    expect(out['original_pages']).toBe(3);
    expect(out['fields']).toHaveLength(1);
  });

  it('removes the draft when a later step fails', async () => {
    setFlags();
    const w = writeWorld();
    const a = await staged(w);
    const out = err(
      await callWrite(
        w,
        'envelopes_prepare',
        write({
          title: 'x',
          document_id: a,
          signers: [{ contact_id: '12345678-1234-4234-8234-123456789012' }],
        }),
      ),
    );
    expect(out.slug).toBe('contact_not_found');
    expect((await w.envelopesRepo.listByOwner(OWNER, { limit: 10 })).items).toHaveLength(0);
  });

  it('needs envelopes:write and documents:write', async () => {
    setFlags();
    const w = writeWorld();
    const a = await staged(w);
    expect(
      err(
        await callWrite(w, 'envelopes_prepare', write({ title: 'x', document_id: a }), {
          scopes: ['envelopes:write'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_prepare',
          write({ title: 'x', document_id: a, owner_id: OWNER }),
        ),
      ).slug,
    ).toBe('validation_error');
  });
});
