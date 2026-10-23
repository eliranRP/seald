import { listTools } from '../../../tool-catalog';
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
  type WriteWorld,
} from '../../__tests__/write-harness';

async function withSigners(w: WriteWorld) {
  const id = await draft(w);
  const ids: string[] = [];
  for (const email of ['a@example.com', 'b@example.com']) {
    const s = ok(
      await callWrite(w, 'envelopes_add_signer', write({ envelope_id: id, email, name: email })),
    );
    ids.push(s['id'] as string);
  }
  return { id, ids };
}

describe('envelopes_set_recipient_order', () => {
  afterEach(() => resetFlags());

  it('sets sequential steps through SigningOrderService, as PUT /envelopes/:id/signing-order', async () => {
    setFlags();
    const w = writeWorld();
    const { id, ids } = await withSigners(w);
    const out = ok(
      await callWrite(
        w,
        'envelopes_set_recipient_order',
        write({
          envelope_id: id,
          delivery_mode: 'sequential',
          signers: [
            { signer_id: ids[1], signing_order: 1 },
            { signer_id: ids[0], signing_order: 2 },
          ],
        }),
      ),
    );
    expect(out['delivery_mode']).toBe('sequential');
    const order = Object.fromEntries(
      (out['signers'] as Array<{ id: string; signing_order: number }>).map((s) => [
        s.id,
        s.signing_order,
      ]),
    );
    expect(order).toEqual({ [ids[0] as string]: 2, [ids[1] as string]: 1 });
  });

  it('needs every signer once (signing_order_invalid), also on the dry run', async () => {
    setFlags();
    const w = writeWorld();
    const { id, ids } = await withSigners(w);
    const partial = {
      envelope_id: id,
      delivery_mode: 'sequential',
      signers: [{ signer_id: ids[0], signing_order: 1 }],
    };
    expect(err(await callWrite(w, 'envelopes_set_recipient_order', write(partial))).slug).toBe(
      'signing_order_invalid',
    );
    expect(
      err(
        await callWrite(w, 'envelopes_set_recipient_order', {
          ...partial,
          idempotency_key: 'dry-key-0001',
          dry_run: true,
        }),
      ).slug,
    ).toBe('signing_order_invalid');
  });

  it('is hidden and uncallable while signingOrder is off', async () => {
    setFlags({ signingOrder: false });
    expect(listTools().map((t) => t.name)).not.toContain('envelopes_set_recipient_order');
    const w = writeWorld();
    await expect(
      callWrite(
        w,
        'envelopes_set_recipient_order',
        write({ envelope_id: OTHER_OWNER, delivery_mode: 'parallel' }),
      ),
    ).rejects.toThrow('Tool not found');
  });

  it("answers another owner's envelope as not found, and needs envelopes:write", async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w, 'Theirs', OTHER_OWNER);
    const args = write({ envelope_id: id, delivery_mode: 'parallel' });
    expect(err(await callWrite(w, 'envelopes_set_recipient_order', args)).slug).toBe(
      'envelope_not_found',
    );
    expect(
      err(await callWrite(w, 'envelopes_set_recipient_order', args, { scopes: ['envelopes:read'] }))
        .slug,
    ).toBe('insufficient_scope');
    expect(
      err(await callWrite(w, 'envelopes_set_recipient_order', write({ envelope_id: id }))).slug,
    ).toBe('validation_error');
  });
});
