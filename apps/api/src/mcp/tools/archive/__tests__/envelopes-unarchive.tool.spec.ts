import {
  OWNER,
  callWrite,
  draft,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_unarchive', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('moves an archived envelope back; the dry run reports it without writing', async () => {
    const w = writeWorld();
    const id = await draft(w);
    ok(await callWrite(w, 'envelopes_archive', write({ envelope_id: id })));
    const dry = ok(
      await callWrite(w, 'envelopes_unarchive', {
        envelope_id: id,
        idempotency_key: 'dry-key-0002',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { envelope_id: id, archived: true } });
    expect((await w.envelopesRepo.findByIdForOwner(OWNER, id))?.archived_at).toEqual(
      expect.any(String),
    );
    const restored = ok(await callWrite(w, 'envelopes_unarchive', write({ envelope_id: id })));
    expect(restored.archived_at).toBeNull();
  });
});
