import {
  OTHER_OWNER,
  callWrite,
  draft,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('envelopes_remove_signer', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  async function withSigner() {
    const w = writeWorld();
    const id = await draft(w);
    const signer = ok(
      await callWrite(
        w,
        'envelopes_add_signer',
        write({ envelope_id: id, email: 'a@example.com', name: 'A' }),
      ),
    );
    return { w, id, signerId: signer['id'] as string };
  }

  it('removes a signer; the dry run leaves it', async () => {
    const { w, id, signerId } = await withSigner();
    const dry = ok(
      await callWrite(w, 'envelopes_remove_signer', {
        envelope_id: id,
        signer_id: signerId,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { signer_id: signerId, removes_fields: 0 } });
    expect(
      ok(
        await callWrite(
          w,
          'envelopes_remove_signer',
          write({ envelope_id: id, signer_id: signerId }),
        ),
      ),
    ).toEqual({ removed: true });
    const env = await w.envelopesRepo.findByIdWithAll(id);
    expect(env?.signers).toHaveLength(0);
  });

  it('is not found for an unknown signer or another owner, insufficient_scope without write', async () => {
    const { w, id, signerId } = await withSigner();
    const other = await draft(w, 'Theirs', OTHER_OWNER);
    expect(
      err(
        await callWrite(
          w,
          'envelopes_remove_signer',
          write({ envelope_id: id, signer_id: '12345678-1234-4234-8234-123456789012' }),
        ),
      ).slug,
    ).toBe('envelope_not_found');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_remove_signer',
          write({ envelope_id: other, signer_id: signerId }),
        ),
      ).slug,
    ).toBe('envelope_not_found');
    expect(
      err(
        await callWrite(
          w,
          'envelopes_remove_signer',
          write({ envelope_id: id, signer_id: signerId }),
          {
            scopes: ['envelopes:read'],
          },
        ),
      ).slug,
    ).toBe('insufficient_scope');
    expect(
      err(await callWrite(w, 'envelopes_remove_signer', write({ envelope_id: id }))).slug,
    ).toBe('validation_error');
  });
});
