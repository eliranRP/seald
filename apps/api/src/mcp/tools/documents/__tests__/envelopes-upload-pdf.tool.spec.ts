import {
  OTHER_OWNER,
  OWNER,
  callWrite,
  draft,
  err,
  markSent,
  ok,
  resetFlags,
  setFlags,
  staged,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_upload_pdf', () => {
  afterEach(() => resetFlags());

  it.each([true, false])(
    'sets document 1 from a staged upload (multiDocumentEnvelopes=%s) and consumes it',
    async (multi) => {
      setFlags({ multiDocumentEnvelopes: multi });
      const w = writeWorld();
      const id = await draft(w);
      const doc = await staged(w, 3);
      const out = ok(
        await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: id, document_id: doc })),
      );
      expect(out).toMatchObject({ pages: 3, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect((out['documents'] as unknown[]).length).toBe(1);
      const row = await w.uploadsRepo.find(OWNER, doc);
      expect(row?.consumed_at).not.toBeNull();
      expect(await w.storage.exists(row?.storage_key ?? '')).toBe(false);
      const events = await w.envelopesRepo.listEventsForEnvelope(id);
      expect(events.map((e) => e.event_type)).toContain('pdf_uploaded');
      // An upload attaches once.
      expect(
        err(
          await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: id, document_id: doc })),
        ).slug,
      ).toBe('upload_already_attached');
    },
  );

  it('gives the upload back when the attach fails (not a draft)', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    const doc = await staged(w);
    markSent(w, id);
    expect(
      err(await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: id, document_id: doc })))
        .slug,
    ).toBe('envelope_not_draft');
    expect((await w.uploadsRepo.find(OWNER, doc))?.consumed_at).toBeNull();
  });

  it("is not found for another owner's envelope or upload, and needs envelopes:write", async () => {
    setFlags();
    const w = writeWorld();
    const mine = await draft(w);
    const theirs = await draft(w, 'Theirs', OTHER_OWNER);
    const doc = await staged(w);
    expect(
      err(
        await callWrite(
          w,
          'envelopes_upload_pdf',
          write({ envelope_id: theirs, document_id: doc }),
        ),
      ).slug,
    ).toBe('envelope_not_found');
    expect(
      err(
        await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: mine, document_id: doc }), {
          owner: OTHER_OWNER,
        }),
      ).slug,
    ).toBe('upload_not_found');
    expect(
      err(
        await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: mine, document_id: doc }), {
          scopes: ['documents:write'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'envelopes_upload_pdf', write({ envelope_id: mine }))).slug).toBe(
      'validation_error',
    );
  });
});
