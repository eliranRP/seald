import { EnvelopesPlaceFieldsOutputSchema } from 'shared';
import {
  OTHER_OWNER,
  callWrite,
  draft,
  err,
  ok,
  resetFlags,
  setFlags,
  staged,
  write,
  writeWorld,
  type WriteWorld,
} from '../../__tests__/write-harness';

async function twoDocDraft(w: WriteWorld) {
  const id = await draft(w);
  const d1 = ok(
    await callWrite(
      w,
      'envelopes_add_document',
      write({ envelope_id: id, document_id: await staged(w, 2) }),
    ),
  );
  const d2 = ok(
    await callWrite(
      w,
      'envelopes_add_document',
      write({ envelope_id: id, document_id: await staged(w, 1) }),
    ),
  );
  const signer = ok(
    await callWrite(
      w,
      'envelopes_add_signer',
      write({ envelope_id: id, email: 'a@example.com', name: 'A' }),
    ),
  );
  return {
    id,
    doc1: (d1['document'] as { id: string }).id,
    doc2: (d2['document'] as { id: string }).id,
    signerId: signer['id'] as string,
  };
}

const field = (signer_id: string, extra: Record<string, unknown> = {}) => ({
  signer_id,
  kind: 'signature',
  page: 1,
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.05,
  ...extra,
});

describe('envelopes_place_fields', () => {
  afterEach(() => resetFlags());

  it('places fields per document, then appends, keeping document_id on each', async () => {
    setFlags();
    const w = writeWorld();
    const { id, doc1, doc2, signerId } = await twoDocDraft(w);
    const first = ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({
          envelope_id: id,
          fields: [field(signerId), field(signerId, { document_id: doc2 })],
        }),
      ),
    );
    expect(EnvelopesPlaceFieldsOutputSchema.safeParse(first).success).toBe(true);
    expect((first['fields'] as Array<{ document_id: string }>).map((f) => f.document_id)).toEqual([
      doc1,
      doc2,
    ]);
    const appended = ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({
          envelope_id: id,
          mode: 'append',
          fields: [field(signerId, { kind: 'date', document_id: doc2, page: 1 })],
        }),
      ),
    );
    expect(appended['fields']).toHaveLength(3);
    const replaced = ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({ envelope_id: id, fields: [field(signerId)] }),
      ),
    );
    expect(replaced['fields']).toHaveLength(1);
  });

  it('accepts the WP-07 kinds and meta while fieldMetaV2 is on, and refuses them while off', async () => {
    setFlags();
    const w = writeWorld();
    const { id, signerId } = await twoDocDraft(w);
    const dropdown = field(signerId, {
      kind: 'dropdown',
      meta: {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    });
    const out = ok(
      await callWrite(w, 'envelopes_place_fields', write({ envelope_id: id, fields: [dropdown] })),
    );
    expect((out['fields'] as Array<{ kind: string; meta?: unknown }>)[0]).toMatchObject({
      kind: 'dropdown',
      meta: expect.objectContaining({ options: expect.any(Array) }),
    });
    setFlags({ fieldMetaV2: false });
    expect(
      err(
        await callWrite(
          w,
          'envelopes_place_fields',
          write({ envelope_id: id, fields: [dropdown] }),
        ),
      ).slug,
    ).toBe('validation_error');
  });

  it('refuses a signer or document from elsewhere, also on the dry run', async () => {
    setFlags();
    const w = writeWorld();
    const { id, signerId } = await twoDocDraft(w);
    const stranger = '12345678-1234-4234-8234-123456789012';
    for (const [bad, slug] of [
      [field(stranger), 'signer_not_in_envelope'],
      [field(signerId, { document_id: stranger }), 'document_not_in_envelope'],
    ] as const) {
      expect(
        err(await callWrite(w, 'envelopes_place_fields', write({ envelope_id: id, fields: [bad] })))
          .slug,
      ).toBe(slug);
      const dry = {
        envelope_id: id,
        fields: [bad],
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      };
      expect(err(await callWrite(w, 'envelopes_place_fields', dry)).slug).toBe(slug);
    }
  });

  it('rejects document_id while multi-document envelopes are off, like the legacy DTO', async () => {
    setFlags({ multiDocumentEnvelopes: false });
    const w = writeWorld();
    const id = await draft(w);
    ok(
      await callWrite(
        w,
        'envelopes_upload_pdf',
        write({ envelope_id: id, document_id: await staged(w) }),
      ),
    );
    const signer = ok(
      await callWrite(
        w,
        'envelopes_add_signer',
        write({ envelope_id: id, email: 'a@example.com', name: 'A' }),
      ),
    );
    const signerId = signer['id'] as string;
    ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({ envelope_id: id, fields: [field(signerId)] }),
      ),
    );
    expect(
      err(
        await callWrite(
          w,
          'envelopes_place_fields',
          write({ envelope_id: id, fields: [field(signerId, { document_id: signerId })] }),
        ),
      ).slug,
    ).toBe('validation_error');
  });

  it('is not found for another owner, and needs envelopes:write', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    const args = write({ envelope_id: id, fields: [] });
    expect(err(await callWrite(w, 'envelopes_place_fields', args)).slug).toBe('envelope_not_found');
    expect(
      err(await callWrite(w, 'envelopes_place_fields', args, { scopes: ['envelopes:read'] })).slug,
    ).toBe('insufficient_scope');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_place_fields',
          write({ envelope_id: id, fields: [{ kind: 'x' }] }),
        ),
      ).slug,
    ).toBe('validation_error');
  });
});
