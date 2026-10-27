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
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_archive / envelopes_unarchive', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('archives a sent envelope without changing its status, then unarchives it', async () => {
    const w = writeWorld();
    const id = await draft(w);
    markSent(w, id);

    const dry = ok(
      await callWrite(w, 'envelopes_archive', {
        envelope_id: id,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({
      dry_run: true,
      would: { envelope_id: id, status: 'awaiting_others', already_archived: false },
    });
    expect((await w.envelopesRepo.findByIdForOwner(OWNER, id))?.archived_at ?? null).toBeNull();

    const archived = ok(await callWrite(w, 'envelopes_archive', write({ envelope_id: id })));
    expect(archived).toMatchObject({ id, status: 'awaiting_others' });
    expect(archived.archived_at).toEqual(expect.any(String));

    const restored = ok(await callWrite(w, 'envelopes_unarchive', write({ envelope_id: id })));
    expect(restored.archived_at).toBeNull();
  });

  it("answers another owner's envelope as not found, and needs envelopes:write", async () => {
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    expect(err(await callWrite(w, 'envelopes_archive', write({ envelope_id: id }))).slug).toBe(
      'envelope_not_found',
    );
    expect(
      err(
        await callWrite(w, 'envelopes_unarchive', write({ envelope_id: id }), {
          scopes: ['envelopes:read'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
