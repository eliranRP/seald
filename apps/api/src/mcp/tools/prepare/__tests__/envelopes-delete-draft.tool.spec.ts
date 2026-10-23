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

describe('envelopes_delete_draft', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('deletes a draft; the dry run only reports what would go', async () => {
    const w = writeWorld();
    const id = await draft(w);
    const dry = ok(
      await callWrite(w, 'envelopes_delete_draft', {
        envelope_id: id,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { envelope_id: id } });
    expect(await w.envelopesRepo.findByIdForOwner(OWNER, id)).not.toBeNull();
    expect(ok(await callWrite(w, 'envelopes_delete_draft', write({ envelope_id: id })))).toEqual({
      deleted: true,
    });
    expect(await w.envelopesRepo.findByIdForOwner(OWNER, id)).toBeNull();
  });

  it('refuses a sent envelope with envelope_not_draft', async () => {
    const w = writeWorld();
    const id = await draft(w);
    markSent(w, id);
    expect(err(await callWrite(w, 'envelopes_delete_draft', write({ envelope_id: id }))).slug).toBe(
      'envelope_not_draft',
    );
  });

  it("answers another owner's draft as not found, and needs envelopes:write", async () => {
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    expect(err(await callWrite(w, 'envelopes_delete_draft', write({ envelope_id: id }))).slug).toBe(
      'envelope_not_found',
    );
    expect(
      err(
        await callWrite(w, 'envelopes_delete_draft', write({ envelope_id: id }), {
          scopes: ['envelopes:read'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'envelopes_delete_draft', write({}))).slug).toBe(
      'validation_error',
    );
  });
});
