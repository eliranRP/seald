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
} from '../../__tests__/write-harness';

describe('envelopes_reorder_documents', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('reorders the documents of a draft', async () => {
    const w = writeWorld();
    const id = await draft(w);
    const docIds: string[] = [];
    for (const pages of [1, 2]) {
      const out = ok(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: id, document_id: await staged(w, pages) }),
        ),
      );
      docIds.push((out['document'] as { id: string }).id);
    }
    const reversed = [...docIds].reverse();
    const out = ok(
      await callWrite(
        w,
        'envelopes_reorder_documents',
        write({ envelope_id: id, document_ids: reversed }),
      ),
    );
    expect(
      (out['documents'] as Array<{ id: string; ord: number }>).map((d) => [d.id, d.ord]),
    ).toEqual([
      [reversed[0], 1],
      [reversed[1], 2],
    ]);
    expect(
      err(
        await callWrite(
          w,
          'envelopes_reorder_documents',
          write({ envelope_id: id, document_ids: [docIds[0]] }),
        ),
      ).slug,
    ).toBe('document_order_invalid');
  });

  it("answers another owner's envelope as not found, and needs envelopes:write", async () => {
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    const args = write({ envelope_id: id, document_ids: [id] });
    expect(err(await callWrite(w, 'envelopes_reorder_documents', args)).slug).toBe(
      'envelope_not_found',
    );
    expect(
      err(await callWrite(w, 'envelopes_reorder_documents', args, { scopes: ['envelopes:read'] }))
        .slug,
    ).toBe('insufficient_scope');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_reorder_documents',
          write({ envelope_id: id, document_ids: [] }),
        ),
      ).slug,
    ).toBe('validation_error');
  });
});
