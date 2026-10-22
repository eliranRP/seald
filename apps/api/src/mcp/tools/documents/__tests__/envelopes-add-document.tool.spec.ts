import { MAX_ENVELOPE_DOCUMENTS } from 'shared';
import { listTools } from '../../../tool-catalog';
import {
  OTHER_OWNER,
  OWNER,
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

describe('envelopes_add_document', () => {
  afterEach(() => resetFlags());

  it('appends staged uploads in order, each one document (WP-03)', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    const first = ok(
      await callWrite(
        w,
        'envelopes_add_document',
        write({ envelope_id: id, document_id: await staged(w, 2, 'msa.pdf') }),
      ),
    );
    expect(first['document']).toMatchObject({ ord: 1, title: 'msa', original_pages: 2 });
    const second = ok(
      await callWrite(
        w,
        'envelopes_add_document',
        write({ envelope_id: id, document_id: await staged(w, 1), title: 'Annex' }),
      ),
    );
    expect(second['document']).toMatchObject({ ord: 2, title: 'Annex', original_pages: 1 });
    expect((second['documents'] as Array<{ ord: number }>).map((d) => d.ord)).toEqual([1, 2]);
    const events = await w.envelopesRepo.listEventsForEnvelope(id);
    expect(events.filter((e) => e.event_type === 'document_added')).toHaveLength(2);
  });

  it('refuses an incomplete upload and the eleventh document', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    const started = ok(await callWrite(w, 'documents_upload_start', write({ filename: 'x.pdf' })));
    expect(
      err(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: id, document_id: started['upload_id'] }),
        ),
      ).slug,
    ).toBe('upload_not_complete');
    for (let i = 0; i < MAX_ENVELOPE_DOCUMENTS; i++) {
      ok(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: id, document_id: await staged(w) }),
        ),
      );
    }
    const extra = await staged(w);
    const dry = {
      envelope_id: id,
      document_id: extra,
      idempotency_key: 'dry-key-0001',
      dry_run: true,
    };
    expect(err(await callWrite(w, 'envelopes_add_document', dry)).slug).toBe('too_many_documents');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: id, document_id: extra }),
        ),
      ).slug,
    ).toBe('too_many_documents');
    expect((await w.uploadsRepo.find(OWNER, extra))?.consumed_at).toBeNull();
  }, 30_000);

  it('is hidden while multiDocumentEnvelopes is off', async () => {
    setFlags({ multiDocumentEnvelopes: false });
    expect(listTools().map((t) => t.name)).not.toContain('envelopes_add_document');
  });

  it('is not found for another owner, and needs envelopes:write', async () => {
    setFlags();
    const w = writeWorld();
    const theirs = await draft(w, 'Theirs', OTHER_OWNER);
    const doc = await staged(w);
    expect(
      err(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: theirs, document_id: doc }),
        ),
      ).slug,
    ).toBe('envelope_not_found');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_add_document',
          write({ envelope_id: theirs, document_id: doc }),
          {
            scopes: ['documents:write'],
          },
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
