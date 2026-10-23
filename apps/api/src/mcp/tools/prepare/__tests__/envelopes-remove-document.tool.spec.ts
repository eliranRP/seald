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

describe('envelopes_remove_document', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('removes a document but never the last one', async () => {
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
    const dry = ok(
      await callWrite(w, 'envelopes_remove_document', {
        envelope_id: id,
        document_id: docIds[1],
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { document_id: docIds[1] } });
    expect(
      ok(
        await callWrite(
          w,
          'envelopes_remove_document',
          write({ envelope_id: id, document_id: docIds[1] }),
        ),
      ),
    ).toEqual({
      removed: true,
    });
    expect(
      err(
        await callWrite(
          w,
          'envelopes_remove_document',
          write({ envelope_id: id, document_id: docIds[0] }),
        ),
      ).slug,
    ).toBe('last_document');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_remove_document',
          write({ envelope_id: id, document_id: docIds[1] }),
        ),
      ).slug,
    ).toBe('document_not_found');
  });

  it("answers another owner's envelope as not found, and needs envelopes:write", async () => {
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    const args = write({ envelope_id: id, document_id: id });
    expect(err(await callWrite(w, 'envelopes_remove_document', args)).slug).toBe(
      'envelope_not_found',
    );
    expect(
      err(await callWrite(w, 'envelopes_remove_document', args, { scopes: ['envelopes:read'] }))
        .slug,
    ).toBe('insufficient_scope');
    expect(
      err(await callWrite(w, 'envelopes_remove_document', write({ envelope_id: id }))).slug,
    ).toBe('validation_error');
  });
});
